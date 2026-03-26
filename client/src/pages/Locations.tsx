import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface Location {
  id: string;
  googlePlaceId: string;
  locationName: string;
  formattedAddress: string | null;
  webhookSecret: string;
  isActive: boolean;
  createdAt: string;
}

export function Locations() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<Location[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newPlaceId, setNewPlaceId] = useState('');
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    try {
      const { data } = await api.get('/api/locations');
      setLocations(data.data);
    } catch { /* */ }
  }

  async function addLocation() {
    if (!newPlaceId.trim() || !newName.trim()) {
      setError('Place ID and name are required');
      return;
    }
    setAdding(true);
    setError('');
    try {
      await api.post('/api/locations', {
        googlePlaceId: newPlaceId.trim(),
        locationName: newName.trim(),
        formattedAddress: newAddress.trim() || undefined,
      });
      setNewPlaceId('');
      setNewName('');
      setNewAddress('');
      setShowAdd(false);
      await loadLocations();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add location';
      setError(msg);
    } finally {
      setAdding(false);
    }
  }

  async function removeLocation(id: string) {
    if (!confirm('Remove this location?')) return;
    await api.delete(`/api/locations/${id}`);
    await loadLocations();
  }

  async function toggleActive(id: string, currentActive: boolean) {
    await api.put(`/api/locations/${id}`, { isActive: !currentActive });
    await loadLocations();
  }

  async function rotateSecret(id: string) {
    if (!confirm('Generate a new webhook secret? The old secret will stop working immediately.')) return;
    await api.post(`/api/locations/${id}/rotate-secret`);
    await loadLocations();
  }

  function toggleSecretVisibility(id: string) {
    setVisibleSecrets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Locations</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowAdd(!showAdd)} style={styles.addBtn}>
            {showAdd ? 'Cancel' : '+ Add Location'}
          </button>
          <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>Back to Dashboard</button>
        </div>
      </header>

      {/* Add form */}
      {showAdd && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#333' }}>Add New Location</h3>
          {error && <p style={{ color: '#E24B4A', fontSize: 13, margin: '0 0 8px' }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Google Place ID" value={newPlaceId} onChange={e => setNewPlaceId(e.target.value)} style={styles.input} />
            <input placeholder="Location Name (e.g. Downtown Branch)" value={newName} onChange={e => setNewName(e.target.value)} style={styles.input} />
            <input placeholder="Address (optional)" value={newAddress} onChange={e => setNewAddress(e.target.value)} style={styles.input} />
            <button onClick={() => void addLocation()} disabled={adding} style={styles.submitBtn}>
              {adding ? 'Adding...' : 'Add Location'}
            </button>
          </div>
        </div>
      )}

      {/* Location cards */}
      {locations.length === 0 ? (
        <div style={styles.empty}>No locations added yet. Click "+ Add Location" to get started.</div>
      ) : (
        locations.map(loc => (
          <div key={loc.id} style={{ ...styles.card, opacity: loc.isActive ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#333' }}>{loc.locationName}</h3>
                {loc.formattedAddress && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>{loc.formattedAddress}</p>}
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#aaa' }}>Place ID: {loc.googlePlaceId}</p>
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: loc.isActive ? '#E8F5E9' : '#FEE', color: loc.isActive ? '#1D9E75' : '#E24B4A',
              }}>
                {loc.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fa', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: '#888' }}>Webhook Secret: </span>
              <code style={{ color: '#333' }}>
                {visibleSecrets.has(loc.id) ? loc.webhookSecret : '••••••••••••••••'}
              </code>
              <button onClick={() => toggleSecretVisibility(loc.id)} style={styles.inlineBtn}>
                {visibleSecrets.has(loc.id) ? 'Hide' : 'Show'}
              </button>
              <button onClick={() => void navigator.clipboard.writeText(loc.webhookSecret)} style={styles.inlineBtn}>Copy</button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={() => void toggleActive(loc.id, loc.isActive)} style={styles.smallBtn}>
                {loc.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => void rotateSecret(loc.id)} style={styles.smallBtn}>Rotate Secret</button>
              <button onClick={() => void removeLocation(loc.id)} style={{ ...styles.smallBtn, color: '#E24B4A', borderColor: '#E24B4A' }}>Remove</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 800, margin: '0 auto', padding: '24px 16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: '#1F4E79' },
  backBtn: { padding: '8px 16px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' },
  addBtn: { padding: '8px 16px', background: '#1F4E79', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'white', fontWeight: 600 },
  card: { background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 },
  input: { padding: '10px 14px', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 14 },
  submitBtn: { padding: '10px 20px', background: '#1F4E79', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' },
  smallBtn: { padding: '6px 12px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#444' },
  inlineBtn: { marginLeft: 8, padding: '2px 8px', background: 'none', border: '1px solid #d1d1d1', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: '#666' },
  empty: { textAlign: 'center', padding: 40, color: '#888', fontSize: 14 },
};
