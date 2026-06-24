'use client';

import { useEffect, useState } from 'react';
import { useClubStore } from '@/stores/club.store';
import api from '@/lib/api';

interface TrialStatus {
  expired: boolean;
  daysRemaining: number | null;
  endsAt?: string;
}

export default function TrialBanner() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const [trial, setTrial] = useState<TrialStatus | null>(null);

  useEffect(() => {
    if (!selectedClub) return;
    api
      .get(`/clubs/${selectedClub.id}`)
      .then(r => {
        if (r.data?.trialStatus) setTrial(r.data.trialStatus);
        else setTrial(null);
      })
      .catch(() => setTrial(null));
  }, [selectedClub?.id]);

  if (!trial) return null;

  if (trial.expired) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center gap-3">
        <span className="text-red-600 font-semibold text-sm">
          ⚠️ Tu período de prueba ha vencido. El club está bloqueado para escritura.
        </span>
        <span className="text-red-500 text-sm">
          Contacta a soporte de Raqueta para reactivar tu cuenta.
        </span>
      </div>
    );
  }

  const color =
    (trial.daysRemaining ?? 99) <= 3
      ? 'bg-orange-50 border-orange-200 text-orange-700'
      : 'bg-amber-50 border-amber-200 text-amber-700';

  return (
    <div className={`${color} border-b px-6 py-2 flex items-center gap-2 text-sm`}>
      <span>🕐</span>
      <span>
        Período de prueba gratuita:{' '}
        <strong>
          {trial.daysRemaining === 0 ? 'vence hoy' : `${trial.daysRemaining} día${trial.daysRemaining === 1 ? '' : 's'} restante${trial.daysRemaining === 1 ? '' : 's'}`}
        </strong>
        . Para continuar después, contacta a soporte de Raqueta.
      </span>
    </div>
  );
}
