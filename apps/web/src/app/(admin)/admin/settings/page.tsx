'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, Send, Loader2, Eye, EyeOff, Info } from 'lucide-react';
import api from '@/lib/api';

const MASKED = '••••••••';

interface Setting { key: string; value: string; updatedAt?: string }

const GROUPS = [
  {
    title: 'SMTP (correo saliente)',
    description: 'Configuración del servidor de correo. Los cambios surten efecto de inmediato sin reiniciar el servidor.',
    hint: (
      <span>
        Proveedor recomendado para pruebas: <strong>Resend</strong> (resend.com — 100 emails/día gratis).
        SMTP host: <code>smtp.resend.com</code>, port: <code>587</code>, usuario: <code>resend</code>,
        contraseña: tu API key (<code>re_xxxx</code>), from: <code>onboarding@resend.dev</code>.
      </span>
    ),
    fields: [
      { key: 'SMTP_HOST',  label: 'Host SMTP',       placeholder: 'smtp.resend.com', sensitive: false },
      { key: 'SMTP_PORT',  label: 'Puerto',           placeholder: '587',              sensitive: false },
      { key: 'SMTP_USER',  label: 'Usuario',          placeholder: 'resend',           sensitive: false },
      { key: 'SMTP_PASS',  label: 'Contraseña / API key', placeholder: 're_xxxxxxxxxx', sensitive: true },
      { key: 'SMTP_FROM',  label: 'Dirección remitente', placeholder: 'noreply@n-go.app', sensitive: false },
    ],
  },
  {
    title: 'Registro de clubes',
    description: 'Parámetros que afectan la auto-inscripción de nuevos clubes.',
    hint: null,
    fields: [
      { key: 'DEFAULT_TRIAL_DAYS', label: 'Días de prueba gratis', placeholder: '14', sensitive: false },
    ],
  },
  {
    title: 'Soporte',
    description: 'Datos de contacto mostrados en emails y banners de soporte.',
    hint: null,
    fields: [
      { key: 'SUPPORT_EMAIL', label: 'Email de soporte', placeholder: 'soporte@n-go.app', sensitive: false },
      { key: 'SUPPORT_PHONE', label: 'Teléfono de soporte', placeholder: '+56 9 1234 5678', sensitive: false },
    ],
  },
];

export default function PlatformSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealPass, setRevealPass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get('/admin/settings')
      .then(r => {
        const init: Record<string, string> = {};
        for (const row of r.data as Setting[]) init[row.key] = row.value;
        setValues(init);
      })
      .finally(() => setLoading(false));
  }, []);

  const handle = (key: string, val: string) => setValues(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    try {
      const settings = Object.entries(values).map(([key, value]) => ({ key, value }));
      await api.put('/admin/settings', { settings });
      toast.success('Configuración guardada');
      // Refresh to get the current masked state
      const r = await api.get('/admin/settings');
      const fresh: Record<string, string> = {};
      for (const row of r.data as Setting[]) fresh[row.key] = row.value;
      setValues(fresh);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail) { toast.error('Ingresa un email de destino'); return; }
    setTesting(true);
    try {
      const r = await api.post('/admin/settings/test-smtp', { to: testEmail });
      if (r.data.ok) toast.success(r.data.message);
      else toast.error(r.data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al enviar');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando configuración…
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Configuración de plataforma</h1>
        <p className="mt-1 text-sm text-gray-500">
          Solo visible para Super Admin. Los cambios surten efecto de inmediato.
        </p>
      </div>

      <div className="space-y-8">
        {GROUPS.map(group => (
          <section key={group.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">{group.title}</h2>
            <p className="mt-1 mb-5 text-sm text-gray-500">{group.description}</p>

            {group.hint && (
              <div className="mb-5 flex gap-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <span>{group.hint}</span>
              </div>
            )}

            <div className="space-y-4">
              {group.fields.map(({ key, label, placeholder, sensitive }) => (
                <div key={key}>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
                  <div className="relative">
                    <input
                      type={sensitive && !revealPass ? 'password' : 'text'}
                      value={values[key] ?? ''}
                      onChange={e => handle(key, e.target.value)}
                      placeholder={placeholder}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    {sensitive && (
                      <button
                        type="button"
                        onClick={() => setRevealPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {revealPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  {sensitive && (
                    <p className="mt-1 text-xs text-gray-400">
                      Deja en blanco o con los puntos para no cambiar la contraseña guardada.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* SMTP test */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Probar envío de email</h2>
          <p className="mt-1 mb-5 text-sm text-gray-500">
            Guarda primero los ajustes SMTP, luego envía un email de prueba para confirmar la entrega.
          </p>
          <div className="flex gap-3">
            <input
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="destinatario@ejemplo.com"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testing}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar prueba
            </button>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[#1b4a86] px-6 py-3 text-sm font-semibold text-white hover:bg-[#123768] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar configuración
          </button>
        </div>
      </div>
    </div>
  );
}
