import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Trash2, X, Download } from 'lucide-react';
import { C, NeoTile, NeoIcon } from '@/components/Neo';
import { loadPhotos, addPhoto, deletePhoto, type Photo } from '@/lib/persistence';

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}

function groupByDate(photos: Photo[]): { label: string; photos: Photo[] }[] {
  const groups: Record<string, Photo[]> = {};
  for (const p of photos) {
    const d = new Date(p.takenAt);
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return Object.entries(groups).map(([label, photos]) => ({ label, photos }));
}

export default function Photos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPhotos(loadPhotos()); }, []);

  const handleCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const dataUrl = await compressImage(file);
    const photo = addPhoto({ dataUrl, takenAt: new Date().toISOString(), label: file.name });
    setPhotos(loadPhotos());
    setViewing(photo);
  }, []);

  const handleDelete = (id: number) => {
    deletePhoto(id);
    setPhotos(loadPhotos());
    if (viewing?.id === id) setViewing(null);
  };

  const groups = groupByDate(photos);

  return (
    <div style={{ padding: '28px 20px 100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Photos</h1>
        <div style={{ width: 48, height: 48, borderRadius: 15, overflow: 'hidden', background: '#111' }}>
          <img src="/maya-logo.jpg" alt="Maya" style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen' }} />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        style={{ display: 'none' }}
      />

      {photos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <NeoIcon bg={C.purpleS} size={72} round={24} style={{ margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={32} color={C.purple} strokeWidth={1.5} />
          </NeoIcon>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>No photos yet</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '0 0 24px', fontWeight: 500 }}>Tap the camera icon to take your first property photo</p>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ height: 52, paddingInline: 28, borderRadius: 16, background: `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Camera size={18} strokeWidth={2} /> Take Photo
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}
          >
            <Camera size={18} strokeWidth={2} /> Take Photo
          </button>

          {groups.map(group => (
            <div key={group.label}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>{group.label}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 20 }}>
                {group.photos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setViewing(p)}
                    className="press-sm"
                    style={{ padding: 0, border: 'none', cursor: 'pointer', borderRadius: 12, overflow: 'hidden', aspectRatio: '1', display: 'block' }}
                  >
                    <img
                      src={p.dataUrl}
                      alt={new Date(p.takenAt).toLocaleTimeString()}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Full-screen viewer */}
      {viewing && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 60, display: 'flex', flexDirection: 'column' }}
            onClick={() => setViewing(null)}
          >
            {/* Header */}
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', flexShrink: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setViewing(null)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={18} color="#fff" />
              </button>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>
                  {new Date(viewing.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0', fontWeight: 500 }}>
                  {new Date(viewing.takenAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(viewing.id); }}
                style={{ background: 'rgba(255,59,48,0.18)', border: 'none', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Trash2 size={18} color="#FF3B30" />
              </button>
            </div>

            {/* Image */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }} onClick={e => e.stopPropagation()}>
              <img
                src={viewing.dataUrl}
                alt="Property photo"
                style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 16, objectFit: 'contain' }}
              />
            </div>

            {/* Download */}
            <div style={{ padding: '16px 20px 40px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <a
                href={viewing.dataUrl}
                download={`maya-photo-${viewing.id}.jpg`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 16, background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
              >
                <Download size={18} strokeWidth={2} /> Save to Device
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
