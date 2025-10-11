import React from 'react';

// Minimal PrivateRoute for development: renders children unconditionally.
// In production, replace with real auth check and redirect to /login when unauthenticated.
export default function PrivateRoute({ children }) {
  return <>{children}</>;
}
