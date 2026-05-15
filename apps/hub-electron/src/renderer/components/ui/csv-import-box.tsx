import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import type { CsvImportResult } from "../../hub-api.js";

export function CsvImportBox({
  title,
  description,
  templateName,
  templateCsv,
  busy,
  result,
  onImport,
}: {
  title: string;
  description?: string;
  templateName: string;
  templateCsv: string;
  busy: boolean;
  result: CsvImportResult | null;
  onImport: (csv: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = templateName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    onImport(await file.text());
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="csv-import-box">
      <div className="csv-import-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <div className="csv-import-actions">
        <button type="button" className="secondary-inline" onClick={downloadTemplate}>
          <Download size={15} />
          Template
        </button>
        <label className="csv-file-button">
          <FileUp size={15} />
          {busy ? "Importing..." : "Choose CSV"}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void importFile(event.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </label>
      </div>
      {fileName ? <span className="csv-file-name">{fileName}</span> : null}
      {result ? (
        <div className={result.failed ? "csv-import-result has-errors" : "csv-import-result"}>
          <strong>
            {result.created} imported
            {result.failed ? ` · ${result.failed} need fixing` : ""}
          </strong>
          {result.errors.length ? (
            <ul>
              {result.errors.slice(0, 5).map((error) => (
                <li key={`${error.row}-${error.message}`}>
                  Row {error.row}: {error.message}
                </li>
              ))}
            </ul>
          ) : (
            <span>Catalog refreshed.</span>
          )}
          {result.errors.length > 5 ? <span>{result.errors.length - 5} more row errors hidden.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
