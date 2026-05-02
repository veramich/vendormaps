import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const [showPreviewBanner, setShowPreviewBanner] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('https://vendormaps.onrender.com/health')
      .catch(() => {});

    if (localStorage.getItem('preview-dismissed')) {
      navigate('/map', { replace: true });
    } else {
      setShowPreviewBanner(true);
    }
  }, [navigate]);

  function dismissPreview() {
    localStorage.setItem('preview-dismissed', '1');
    setShowPreviewBanner(false);
  }

  function continueToHome() {
    dismissPreview();
    navigate('/map');
  }

  return (
    <div className="landing-page">
      {showPreviewBanner && (
        <div className="preview-overlay">
          <div className="preview-popup" onClick={e => e.stopPropagation()}>
            <div className="preview-popup-emoji">🚧</div>
            <h2 className="preview-popup-title">You're catching us early!</h2>
            <p className="preview-popup-body">
              Vendor Maps is still a work in progress — things might be a little rough around the edges right now, but we're building something awesome.
            </p>
            <p className="preview-popup-body">
              Expect new features, better search, and more vendors rolling in soon. Thanks for being here from the start!
            </p>
            <button className="preview-popup-btn" onClick={continueToHome}>
              Let's Go!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}