import { BLWMap } from '../../components/map/BLWMap'

export default function CanMapPage() {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex' }}>
      <BLWMap mode="default" />
    </div>
  )
}
