'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Mail, PhoneOff, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { hasAppAccount, type RosterLike } from '../player-type';
import { rosterDisplayName, teamDisplayName } from '../display-name';

interface RegistrationForComms {
  id: string;
  roster?: RosterLike | null;
  team?: { id?: string; player1Roster?: RosterLike | null; player2Roster?: RosterLike | null } | null;
}

const TEMPLATES: Array<{ id: string; label: string; text: string }> = [
  {
    id: 'bracket',
    label: 'Cuadro publicado',
    text: 'El cuadro ha sido publicado — revisa la app para ver tus partidos',
  },
  {
    id: 'results',
    label: 'Resultados actualizados',
    text: 'Los resultados han sido actualizados — revisa tu ranking',
  },
  {
    id: 'reminder',
    label: 'Recordatorio de inscripción',
    text: 'Te quedan 24 horas para inscribirte al torneo. Toca para inscribirte ahora.',
  },
];

interface Props {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  registrations: RegistrationForComms[];
}

export default function ComunicarTab({ tournamentId, tournamentName, tournamentStatus, registrations }: Props) {
  const [templateId, setTemplateId] = useState<string>('custom');
  const [customMessage, setCustomMessage] = useState<string>('');

  // Flatten registrations to individual players (teams → 2 entries) for the
  // recipient split and the manual-outreach list.
  const recipients = useMemo(() => {
    const out: Array<{ id: string; label: string; roster: RosterLike | null; hasApp: boolean }> = [];
    for (const r of registrations) {
      if (r.team) {
        const a = r.team.player1Roster;
        const b = r.team.player2Roster;
        if (a) {
          out.push({
            id: `${r.id}-p1`,
            label: rosterDisplayName(a as any),
            roster: a,
            hasApp: hasAppAccount(a),
          });
        }
        if (b) {
          out.push({
            id: `${r.id}-p2`,
            label: rosterDisplayName(b as any),
            roster: b,
            hasApp: hasAppAccount(b),
          });
        }
      } else if (r.roster) {
        out.push({
          id: r.id,
          label: rosterDisplayName(r.roster as any),
          roster: r.roster,
          hasApp: hasAppAccount(r.roster),
        });
      }
    }
    return out;
  }, [registrations]);

  const withApp = recipients.filter(r => r.hasApp);
  const withoutApp = recipients.filter(r => !r.hasApp);

  const selectedTemplate = TEMPLATES.find(t => t.id === templateId);
  const messageText = templateId === 'custom' ? customMessage : (selectedTemplate?.text ?? '');
  const canSend =
    messageText.trim().length > 0 &&
    withApp.length > 0 &&
    ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS'].includes(tournamentStatus);

  const send = useMutation({
    mutationFn: () =>
      api.post(`/tournaments/${tournamentId}/notify-open`, {
        message: messageText.trim(),
      }),
    onSuccess: res => {
      const notified = res?.data?.notified ?? 0;
      toast.success(`Notificación enviada a ${notified} jugador${notified === 1 ? '' : 'es'}`);
    },
    onError: () => toast.error('Error al enviar la notificación'),
  });

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-semibold text-gray-900">Comunicación masiva</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Enviá notificaciones push a los jugadores inscriptos del torneo. Los jugadores sin app
          no recibirán la push y deben contactarse por los canales tradicionales.
        </p>
      </div>

      {/* Recipient split */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-green-700" />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-gray-900">{withApp.length}</p>
            <p className="text-xs text-gray-500">jugadores con app (recibirán push)</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <PhoneOff className="w-5 h-5 text-blue-700" />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-gray-900">{withoutApp.length}</p>
            <p className="text-xs text-gray-500">jugadores sin app (notificación manual)</p>
          </div>
        </div>
      </div>

      {tournamentStatus === 'DRAFT' && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-800">
          El torneo está en borrador. Cambiá el estado a <strong>Inscripción abierta</strong> o
          <strong> En curso</strong> para poder enviar notificaciones.
        </div>
      )}

      {/* Message composer */}
      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla</label>
          <select
            className="input-field"
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
          >
            <option value="custom">Mensaje personalizado</option>
            {TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje</label>
          <textarea
            className="input-field"
            rows={3}
            value={templateId === 'custom' ? customMessage : (selectedTemplate?.text ?? '')}
            onChange={e => {
              setTemplateId('custom');
              setCustomMessage(e.target.value);
            }}
            placeholder="Escribí el mensaje que recibirán los jugadores…"
          />
          <p className="text-xs text-gray-400 mt-1">{messageText.length} caracteres</p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Se enviará a <span className="font-semibold text-gray-700">{withApp.length}</span> jugador{withApp.length === 1 ? '' : 'es'} con app
          </p>
          <button
            className="btn-primary flex items-center gap-2"
            disabled={!canSend || send.isPending}
            onClick={() => send.mutate()}
          >
            <Send className="w-4 h-4" />
            {send.isPending ? 'Enviando…' : 'Enviar notificación'}
          </button>
        </div>
      </div>

      {/* Manual outreach list */}
      {withoutApp.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-700" />
              <h4 className="font-semibold text-gray-900">Notificación manual</h4>
              <span className="badge-blue text-xs bg-blue-50 text-blue-700">{withoutApp.length}</span>
            </div>
            <CopyManualButton recipients={withoutApp} tournamentName={tournamentName} />
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Estos jugadores no tienen cuenta en la app. Contactalos por WhatsApp, email o teléfono
            para notificarles manualmente.
          </p>
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {withoutApp.map(r => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-900 truncate">{r.label}</span>
                  <PlayerTypeBadge roster={r.roster} />
                </div>
                <span className="text-xs text-gray-400">Sin app</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CopyManualButton({
  recipients,
  tournamentName,
}: {
  recipients: Array<{ label: string }>;
  tournamentName: string;
}) {
  const [copied, setCopied] = useState(false);

  const text = [
    `${tournamentName} — jugadores sin app que requieren notificación manual:`,
    ...recipients.map((r, i) => `${i + 1}. ${r.label}`),
  ].join('\n');

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Lista copiada al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  };

  return (
    <button onClick={onCopy} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1">
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copiado' : 'Copiar lista'}
    </button>
  );
}