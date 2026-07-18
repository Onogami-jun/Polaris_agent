import React, { useRef, useState } from 'react';

interface Props { onImage: (dataUrl: string, fileName: string) => void; disabled?: boolean; }

const ImageInput: React.FC<Props> = ({ onImage, disabled }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImage(reader.result as string, file.name);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} disabled={disabled} style={{ display: 'none' }} />
      <button onClick={() => ref.current?.click()} disabled={disabled}
        style={{
          width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)', background: hover ? 'var(--hover)' : 'transparent',
          color: 'var(--text3)', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s', opacity: disabled ? .3 : 1,
        }} title="上传图片">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
        </svg>
      </button>
    </div>
  );
};

export default ImageInput;
