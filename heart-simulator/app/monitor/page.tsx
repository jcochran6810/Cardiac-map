'use client';

import dynamic from 'next/dynamic';

const MonitorWindow = dynamic(() => import('@/components/monitor/MonitorWindow'), {
  ssr: false,
  loading: () => <div className="h-screen bg-black" />,
});

export default function MonitorPage() {
  return <MonitorWindow />;
}
