import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { apiPost, getApiErrorMessage } from '../lib/api';
import './AudioProcessor.css';
import './AdaptiveMusic.css';

const MOODS = [
  { id: 'calm', label: 'Calm' },
  { id: 'focused', label: 'Focused' },
  { id: 'intense', label: 'Intense' },
  { id: 'happy', label: 'Happy' },
];

const STEM_ORDER = ['mix', 'music', 'voice', 'kick', 'snare', 'hat', 'bass', 'chords'];

function wavSrc(b64) {
  if (!b64) {
    return '';
  }
  return `data:audio/wav;base64,${b64}`;
}

function AdaptiveMusic() {
  const [mood, setMood] = useState('focused');
  const [energy, setEnergy] = useState(62);
  const [tension, setTension] = useState(40);
  const [focus, setFocus] = useState(60);
  const [valence, setValence] = useState(0.5);
  const [bpm, setBpm] = useState(0);
  const [duration, setDuration] = useState(6);
  const [description, setDescription] = useState('Operator scene: hold the line and keep the next move clear.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const stems = useMemo(() => {
    const encoded = result?.stems || {};
    return STEM_ORDER
      .map((name) => ({ name, src: wavSrc(encoded[name]) }))
      .filter((item) => item.src);
  }, [result]);

  const handleCompose = async () => {
    setLoading(true);
    try {
      const response = await apiPost('/api/jarvis/adaptive-music/compose', {
        mood,
        energy,
        tension,
        focus,
        valence,
        bpm: bpm > 0 ? bpm : undefined,
        duration_sec: duration,
        description,
      });
      setResult(response.data);
      toast.success('Adaptive score mixed');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adaptive-music">
      <div className="page-intro">
        <h1>Adaptive Score</h1>
        <p>
          Beatbox owns the score. Speakers mix and duck the stems. Scene state
          drives a deterministic arrangement — not a loop generator.{' '}
          <Link to="/model-library">Model Library</Link>
          {' · '}
          <Link to="/audio-processor">Audio Processor</Link>
        </p>
      </div>

      <div className="processor-container">
        <div className="input-section page-panel">
          <label>Mood</label>
          <div className="audio-lane-toggle" role="radiogroup" aria-label="Score mood">
            {MOODS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mood === item.id ? 'active' : ''}
                aria-pressed={mood === item.id}
                onClick={() => setMood(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label>Scene / intent</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows="4"
            placeholder="Narrative pacing, tension, or operator intent..."
          />

          <div className="control-group">
            <label>Energy: {energy}</label>
            <input type="range" min="0" max="100" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} />
          </div>
          <div className="control-group">
            <label>Tension: {tension}</label>
            <input type="range" min="0" max="100" value={tension} onChange={(event) => setTension(Number(event.target.value))} />
          </div>
          <div className="control-group">
            <label>Focus: {focus}</label>
            <input type="range" min="0" max="100" value={focus} onChange={(event) => setFocus(Number(event.target.value))} />
          </div>
          <div className="control-group">
            <label>Valence: {valence.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={valence}
              onChange={(event) => setValence(Number(event.target.value))}
            />
          </div>
          <div className="control-group">
            <label>Duration: {duration}s</label>
            <input type="range" min="2" max="12" value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
          </div>
          <div className="control-group">
            <label>BPM {bpm > 0 ? bpm : '(derived)'}</label>
            <input type="range" min="0" max="175" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} />
          </div>

          <button className="process-btn" onClick={handleCompose} disabled={loading}>
            {loading ? 'Composing…' : 'Compose score + mix'}
          </button>
        </div>

        <div className="output-section page-panel">
          <h2>Playable stems</h2>
          {result ? (
            <>
              <p className="file-name">
                {result.mood} · {result.bpm} BPM · {Number(result.duration_sec).toFixed(1)}s · {result.engine}
              </p>
              <p className="file-name">mix sha256 {String(result.mix_sha256 || '').slice(0, 16)}…</p>
              {stems.map((stem) => (
                <div key={stem.name} className="adaptive-stem">
                  <strong>{stem.name}</strong>
                  <audio controls src={stem.src} style={{ width: '100%' }} />
                </div>
              ))}
              {!stems.length ? <p className="file-name">Score rendered but audio payload was omitted.</p> : null}
            </>
          ) : (
            <p className="file-name">No score yet. Set scene state and compose.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdaptiveMusic;
