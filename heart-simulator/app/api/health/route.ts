import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    name: 'CardioSim — Cardiac Education Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
