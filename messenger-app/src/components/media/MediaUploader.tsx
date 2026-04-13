
import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';

interface MediaUploaderProps {
    onFilesSelected: (files: File[]) => void;
    maxFiles?: number;
}

export function MediaUploader({ onFilesSelected, maxFiles = 10 }: MediaUploaderProps) {
    const [files, setFiles] = useState<File[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (acceptedFiles: File[]) => {
        const newFiles = [...files, ...acceptedFiles].slice(0, maxFiles);
        setFiles(newFiles);
        onFilesSelected(newFiles);
    };

    const handleRemove = (index: number) => {
        const newFiles = files.filter((_, i) => i !== index);
        setFiles(newFiles);
        onFilesSelected(newFiles);
    };

    return (
        <div className="flex flex-col gap-4 p-4 border-2 border-dashed border-muted rounded-lg hover:border-sidebar-primary/50 transition-colors">
            <div
                className="flex flex-col items-center justify-center py-8 text-center cursor-pointer"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const droppedFiles = Array.from(e.dataTransfer.files);
                        const newFiles = [...files, ...droppedFiles].slice(0, 10); // Use sliced array directly
                        setFiles(newFiles);
                        onFilesSelected(newFiles);
                    }
                }}
            >
                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                    Перетащите файлы сюда или нажмите для выбора
                </p>
                <input
                    type="file"
                    ref={inputRef}
                    className="hidden"
                    multiple
                    onChange={(e) => {
                        if (e.target.files) {
                            handleDrop(Array.from(e.target.files));
                        }
                    }}
                />
            </div>

            {/* File Preview List */}
            {files.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {files.map((file, i) => (
                        <div key={i} className="relative group aspect-square bg-muted rounded overflow-hidden">
                            {file.type.startsWith('image/') ? (
                                <img
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs p-1 text-center break-words">
                                    {file.name}
                                </div>
                            )}
                            <button
                                className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemove(i);
                                }}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
