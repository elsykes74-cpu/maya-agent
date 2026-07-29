import { Eye, LockKeyhole } from 'lucide-react'
import { useNavigate } from 'react-router'
import { C, NeoIcon, NeoTile } from '@/components/Neo'

export default function PreviewUnavailable({ feature }: { feature: string }) {
  const navigate = useNavigate()

  return (
    <div style={{ padding: '48px 20px 24px' }}>
      <NeoTile style={{ padding: 28, textAlign: 'center' }}>
        <NeoIcon
          bg={C.tealS}
          size={72}
          round={24}
          style={{ margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <LockKeyhole size={30} color={C.teal} strokeWidth={1.8} />
        </NeoIcon>
        <h1 style={{ margin: 0, color: C.text, fontSize: 24, fontWeight: 800 }}>{feature}</h1>
        <p style={{ margin: '10px auto 22px', maxWidth: 320, color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
          This screen connects to protected services, so actions are disabled in the public Preview.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="maya-tile press-sm"
          style={{ border: 'none', borderRadius: 16, padding: '12px 20px', background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, color: '#fff', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <Eye size={17} /> Continue previewing
        </button>
      </NeoTile>
    </div>
  )
}
