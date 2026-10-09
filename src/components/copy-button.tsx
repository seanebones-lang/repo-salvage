"use client";
import { useState } from "react";
import { Icon } from "./icon";

export function CopyButton({
  text,
  label = "Copy reuse brief",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  return (
    <span className="copy-control">
      <button
        type="button"
        className="button button-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setStatus("Copied to clipboard");
          } catch {
            setStatus("Clipboard unavailable. Use the download instead.");
          }
        }}
      >
        <Icon name="copy" />
        {label}
      </button>
      <span role="status" className="form-status">
        {status}
      </span>
    </span>
  );
}
