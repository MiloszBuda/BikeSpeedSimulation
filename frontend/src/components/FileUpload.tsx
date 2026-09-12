import React, { useRef, useState } from 'react';
import { UploadCloud, FileCheck, AlertCircle, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  fileName?: string;
  error?: string | null;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  isLoading,
  fileName,
  error,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.fit')) {
        onFileSelected(file);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`p-5 border-2 border-dashed rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 transition-all ${
          isDragging
            ? 'border-teal-400 bg-teal-950/30'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/80'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".fit"
          onChange={handleChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-teal-300 text-sm font-medium">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Parsowanie pliku .FIT i pobieranie pogody z Open-Meteo ERA5...</span>
          </div>
        ) : fileName ? (
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
            <FileCheck className="w-5 h-5" />
            <span>Wczytano: <b className="font-mono">{fileName}</b> (kliknij, aby zmienić plik)</span>
          </div>
        ) : (
          <>
            <UploadCloud className="w-8 h-8 text-teal-400" />
            <div className="text-center">
              <span className="text-sm font-semibold text-slate-200 block">
                Upuść tutaj plik aktywności <span className="text-teal-400 font-mono">.FIT</span> lub kliknij, aby wybrać
              </span>
              <span className="text-xs text-slate-400">
                Wspiera pliki Garmin / Wahoo / Hammerhead ze śladem GPS, mocą i prędkością
              </span>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
