import React from 'react';

export default function EmptyState() {
  return (
    <div className="graphlens-empty-state">
      <h2 style={{ margin: 0, fontSize: 16 }}>Start by searching for an entity</h2>
      <p style={{ margin: 0, maxWidth: 360 }}>
        Search for a user, host, IP address, application or any other entity above. GraphLens will
        show it as a node, then you can expand it to explore its directly related nodes one hop at
        a time.
      </p>
    </div>
  );
}
