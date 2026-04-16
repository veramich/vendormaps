import { useEffect, useState } from 'react';
import {Link} from 'react-router-dom';

export default function LandingPage() {
  const [showPreviewBanner, setShowPreviewBanner] = useState(false);

  useEffect(() => {
    fetch('https://vendormaps.onrender.com/health')
      .catch(() => {});
    if (!localStorage.getItem('preview-dismissed')) {
      setShowPreviewBanner(true);
    }
  }, []);

  function dismissPreview() {
    localStorage.setItem('preview-dismissed', '1');
    setShowPreviewBanner(false);
  }

  return (
    <div className="landing-page">
      {showPreviewBanner && (
        <div className="preview-overlay" onClick={dismissPreview}>
          <div className="preview-popup" onClick={e => e.stopPropagation()}>
            <div className="preview-popup-emoji">🚧</div>
            <h2 className="preview-popup-title">You're catching us early!</h2>
            <p className="preview-popup-body">
              Vendor Maps is still a work in progress — things might be a little rough around the edges right now, but we're building something awesome.
            </p>
            <p className="preview-popup-body">
              Expect new features, better search, and more vendors rolling in soon. Thanks for being here from the start!
            </p>
            <button className="preview-popup-btn" onClick={dismissPreview}>
              Got it, let's explore!
            </button>
          </div>
        </div>
      )}
      <div className="landing-hero">
        <h1>Welcome to Vendor Maps</h1>
        <p>FIND LOCAL VENDORS</p>

      </div>
      <p className="landing-actions-label">What would you like to do today</p>
      <ul className="landing-actions">
        <li className="landing-action-item">
          <Link to="/add-business">
            <h2>ADD</h2>
            <h3>Add a Business</h3>
          </Link>
        </li>
        <li className="landing-action-item">
          <Link to="/businesses">
            <h2>SEARCH</h2>
            <h3>Search for Vendors</h3>
          </Link>
        </li>
        <li className="landing-action-item">
          <Link to="/map">
            <h2>EXPLORE</h2>
            <h3>Explore the Map</h3>
          </Link>
        </li>
      </ul>
    </div>
  );
}