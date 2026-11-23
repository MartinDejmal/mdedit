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
}
