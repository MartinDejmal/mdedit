/**
 * About dialog – displays app name, version, license and author information.
 */
import { useEffect, useRef } from "react";
import * as bridge from "../../services/tauriBridge";

const APP_VERSION = __APP_VERSION__;

const MDEDIT_URL = "https://github.com/MartinDejmal/mdedit";

interface AboutDialogProps {
  onClose: () => void;
}

export default function AboutDialog({ onClose }: AboutDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleLinkClick = (url: string) => {
    void bridge.openInBrowser(url);
  };

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="about-header">
          <img
            src="/www/icon.png"
            alt="mdedit logo"
            className="about-logo"
          />
          <div>
            <h2 id="about-title" className="about-app-name">mdedit</h2>
            <p className="about-version">Version {APP_VERSION}</p>
          </div>
        </div>

        <p className="about-description">
          A lightweight, cross-platform WYSIWYG Markdown editor built on
          Tauri 2, React 18, and Tiptap.
        </p>

        <dl className="about-meta">
          <dt>Author</dt>
          <dd>Martin Dejmal</dd>

          <dt>License</dt>
          <dd>GNU General Public License v3.0</dd>

          <dt>Source</dt>
          <dd>
            <button
              type="button"
              className="about-link"
              onClick={() => handleLinkClick(MDEDIT_URL)}
            >
              github.com/MartinDejmal/mdedit
            </button>
          </dd>

          <dt>Documentation</dt>
          <dd>
            <button
              type="button"
              className="about-link"
              onClick={() => handleLinkClick(MDEDIT_URL)}
            >
              User documentation
            </button>
          </dd>
        </dl>

        <div className="confirm-actions">
          <button
            type="button"
            ref={closeButtonRef}
            className="primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
