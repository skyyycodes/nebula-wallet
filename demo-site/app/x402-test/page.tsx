'use client';

import { useEffect, useState } from 'react';

export default function X402TestPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f1e]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <iframe 
      src="/x402-complete-test.html" 
      className="w-full h-screen border-0"
      title="X402 Complete Test Suite"
    />
  );
}
