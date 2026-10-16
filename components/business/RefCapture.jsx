"use client";

import { useEffect } from 'react';
import { captureRef } from '@/lib/business/referral';

// Keeps a ?ref= code the visitor arrived with on any business page (lib/business/referral.js). Renders nothing.
export default function RefCapture() {
  useEffect(() => void captureRef(), []);
  return null;
}
