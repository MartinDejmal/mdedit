use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    name: String,
    path: String,
    is_directory: bool,
}

// Read one level at a time. Do not follow symlinks into cycles or outside the tree.
pub fn markdown_directory_entries(path: &std::path::Path) -> Result<Vec<DirectoryEntry>, String> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        let entry_path = entry.path();
        let is_markdown = entry_path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
        if kind.is_dir() || (kind.is_file() && is_markdown) {
            entries.push(DirectoryEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry_path.to_string_lossy().into_owned(),
                is_directory: kind.is_dir(),
            });
        }
    }
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

/// Create an empty document atomically; never truncate an existing file or symlink.
pub fn create_markdown_file(folder: &std::path::Path) -> Result<String, String> {
    if !folder.is_absolute() {
        return Err("Select an absolute folder path.".into());
    }
    let metadata = std::fs::metadata(folder).map_err(|e| e.to_string())?;
    if !metadata.is_dir() {
        return Err("The selected path is not a folder.".into());
    }
    for index in 1..=10_000 {
        let name = if index == 1 {
            "Untitled.md".to_string()
        } else {
            format!("Untitled {}.md", index)
        };
        let path = folder.join(name);
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => {
                drop(file);
                return Ok(path.to_string_lossy().into_owned());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Could not find an unused document name in this folder.".into())
}

fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty()
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Enter a valid file or folder name without path separators.".into());
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
        return Err("This name is reserved by the operating system.".into());
    }
    Ok(())
}

fn markdown_file(path: &std::path::Path) -> Result<std::fs::Metadata, String> {
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("md"))
    {
        return Err("Select an absolute Markdown file path.".into());
    }
    let metadata = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("Only regular Markdown files can be changed.".into());
    }
    Ok(metadata)
}

pub fn relocate_markdown_file(
    source: &std::path::Path,
    folder: &std::path::Path,
    name: Option<&str>,
) -> Result<String, String> {
    let metadata = markdown_file(source)?;
    let name = name
        .or_else(|| source.file_name().and_then(|n| n.to_str()))
        .ok_or("Invalid file name.")?;
    validate_name(name)?;
    if !std::path::Path::new(name)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md"))
    {
        return Err("The file name must end with .md.".into());
    }
    if !folder.is_absolute() || !folder.is_dir() {
        return Err("Select an existing destination folder.".into());
    }
    let target = folder.join(name);
    if target == source {
        return Ok(source.to_string_lossy().into_owned());
    }
    // Exclusive creation works across filesystems and never replaces a destination.
    let mut input = std::fs::File::open(source).map_err(|e| e.to_string())?;
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| e.to_string())?;
    let result = (|| -> std::io::Result<()> {
        std::io::copy(&mut input, &mut output)?;
        let mut times = std::fs::FileTimes::new();
        if let Ok(modified) = metadata.modified() {
            times = times.set_modified(modified);
        }
        output.set_times(times)?;
        output.set_permissions(metadata.permissions())?;
        output.sync_all()?;
        drop(input);
        drop(output);
        std::fs::remove_file(source)
    })();
    if let Err(error) = result {
        #[cfg(windows)]
        if let Ok(metadata) = std::fs::metadata(&target) {
            let mut permissions = metadata.permissions();
            permissions.set_readonly(false);
            let _ = std::fs::set_permissions(&target, permissions);
        }
        if let Err(cleanup) = std::fs::remove_file(&target) {
            return Err(format!(
                "{}; could not remove incomplete destination {}: {}",
                error,
                target.display(),
                cleanup
            ));
        }
        return Err(error.to_string());
    }
    Ok(target.to_string_lossy().into_owned())
}

pub fn delete_markdown_file(path: &std::path::Path) -> Result<(), String> {
    markdown_file(path)?;
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

pub fn create_directory(parent: &std::path::Path, name: &str) -> Result<String, String> {
    validate_name(name)?;
    if !parent.is_absolute() || !parent.is_dir() {
        return Err("Select an existing parent folder.".into());
    }
    let path = parent.join(name);
    std::fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static ID: AtomicUsize = AtomicUsize::new(0);
            let path = std::env::temp_dir().join(format!(
                "mdedit-tree-{}-{}",
                std::process::id(),
                ID.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lists_only_directories_and_md_files_with_directories_first() {
        let dir = Fixture::new();
        for name in [
            "z.md",
            "A.MD",
            "ignore.txt",
            "ignore.markdown",
            "README",
            "image.png",
        ] {
            std::fs::write(dir.0.join(name), "").unwrap();
        }
        std::fs::create_dir(dir.0.join("subfolder")).unwrap();
        std::fs::write(dir.0.join("subfolder/nested.md"), "").unwrap();
        let entries = markdown_directory_entries(&dir.0).unwrap();
        assert_eq!(
            entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
            ["subfolder", "A.MD", "z.md"]
        );
        assert!(entries[0].is_directory);
        assert!(!entries[1].is_directory);
        assert_eq!(PathBuf::from(&entries[1].path), dir.0.join("A.MD"));
        assert_eq!(
            markdown_directory_entries(&dir.0.join("subfolder"))
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn empty_folders_and_unavailable_paths() {
        let dir = Fixture::new();
        assert!(markdown_directory_entries(&dir.0).unwrap().is_empty());
        assert!(markdown_directory_entries(&dir.0.join("missing")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinks_including_directory_cycles() {
        let dir = Fixture::new();
        std::fs::write(dir.0.join("real.md"), "").unwrap();
        std::os::unix::fs::symlink(&dir.0, dir.0.join("cycle")).unwrap();
        std::os::unix::fs::symlink(dir.0.join("real.md"), dir.0.join("alias.md")).unwrap();
        let entries = markdown_directory_entries(&dir.0).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "real.md");
        assert!(delete_markdown_file(&dir.0.join("alias.md")).is_err());
        assert!(relocate_markdown_file(&dir.0.join("alias.md"), &dir.0, Some("moved.md")).is_err());
        assert!(dir.0.join("real.md").exists());
    }
    #[test]
    fn creates_empty_files_without_overwriting_existing_entries() {
        let dir = Fixture::new();
        std::fs::write(dir.0.join("Untitled.md"), "Keep me").unwrap();
        std::fs::create_dir(dir.0.join("Untitled 2.md")).unwrap();
        let path = create_markdown_file(&dir.0).unwrap();
        assert_eq!(PathBuf::from(&path), dir.0.join("Untitled 3.md"));
        assert_eq!(std::fs::read(&path).unwrap(), Vec::<u8>::new());
        assert_eq!(
            std::fs::read_to_string(dir.0.join("Untitled.md")).unwrap(),
            "Keep me"
        );
        assert!(create_markdown_file(&dir.0.join("missing")).is_err());
        assert!(create_markdown_file(&dir.0.join("Untitled.md")).is_err());
    }

    #[test]
    fn concurrent_creation_gets_distinct_empty_files() {
        let dir = Fixture::new();
        let threads: Vec<_> = (0..4)
            .map(|_| {
                let folder = dir.0.clone();
                std::thread::spawn(move || create_markdown_file(&folder).unwrap())
            })
            .collect();
        let paths: std::collections::HashSet<_> =
            threads.into_iter().map(|t| t.join().unwrap()).collect();
        assert_eq!(paths.len(), 4);
        for path in paths {
            assert_eq!(std::fs::metadata(path).unwrap().len(), 0);
        }
    }
    #[test]
    fn manages_files_without_overwriting_or_losing_contents() {
        let dir = Fixture::new();
        let destination = dir.0.join("nested");
        create_directory(&dir.0, "nested").unwrap();
        assert!(create_directory(&dir.0, "nested").is_err());
        for name in [
            "../outside",
            "..",
            "CON",
            "bad/name",
            "bad\\name",
            "trailing.",
        ] {
            assert!(create_directory(&dir.0, name).is_err());
        }
        let source = dir.0.join("source.md");
        std::fs::write(&source, "Original content").unwrap();
        let modified = std::fs::metadata(&source).unwrap().modified().unwrap();
        std::fs::write(destination.join("source.md"), "Keep target").unwrap();
        assert!(relocate_markdown_file(&source, &destination, None).is_err());
        assert_eq!(
            std::fs::read_to_string(&source).unwrap(),
            "Original content"
        );
        assert_eq!(
            std::fs::read_to_string(destination.join("source.md")).unwrap(),
            "Keep target"
        );
        let moved = relocate_markdown_file(&source, &destination, Some("renamed.md")).unwrap();
        assert!(!source.exists());
        assert_eq!(std::fs::read_to_string(&moved).unwrap(), "Original content");
        assert_eq!(
            std::fs::metadata(&moved).unwrap().modified().unwrap(),
            modified
        );
        assert!(
            relocate_markdown_file(std::path::Path::new(&moved), &dir.0, Some("../escape.md"))
                .is_err()
        );
        assert!(
            relocate_markdown_file(std::path::Path::new(&moved), &dir.0, Some("wrong.txt"))
                .is_err()
        );
        assert!(delete_markdown_file(&destination).is_err());
        delete_markdown_file(std::path::Path::new(&moved)).unwrap();
        assert!(!std::path::Path::new(&moved).exists());
    }
}
