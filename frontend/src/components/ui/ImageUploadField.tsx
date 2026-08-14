import { useRef, useState } from 'react';
import { ImageOff, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiUpload, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';

const MAX_BYTES = 5 * 1024 * 1024;

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
}

/**
 * A pasteable URL field plus a direct upload button. Products, the
 * restaurant's logo and the website's theme all point at a plain URL column,
 * so uploading just has to produce one - it does not have to replace the
 * text field, which still works for an image already hosted elsewhere.
 */
export function ImageUploadField({ label, value, onChange }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error('That image is larger than 5 MB.');
      return;
    }

    setUploading(true);
    try {
      const { url } = await apiUpload<{ url: string }>(endpoints.uploads.create, file);
      onChange(url);
      toast.success('Image uploaded.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not upload that image.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <TextField label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://…" />
        </div>

        {value ? (
          <img src={value} alt="" className="h-10 w-10 shrink-0 rounded-control border border-line object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-dashed border-line text-ink-faint">
            <ImageOff className="h-4 w-4" />
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          size="md"
          isLoading={isUploading}
          leadingIcon={<Upload className="h-4 w-4" />}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
