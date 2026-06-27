'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

export default function RegisterClubPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    clubName: '',
    email: '',
    password: '',
    displayName: '',
    phone: '',
    city: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/clubs/register', form);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Error al registrar el club');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="text-5xl mb-4">🎾</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Club registrado!</h2>
            <p className="text-gray-600 mb-4">
              Te enviamos un correo de verificación a <strong>{form.email}</strong>.
              Verifica tu cuenta para activar tu prueba gratuita de <strong>14 días</strong>.
            </p>
            <Link href="/login" className="btn-primary inline-block">
              Ir al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <span className="text-3xl">🎾</span>
          </div>
          <h1 className="text-3xl font-bold text-white">N-Go</h1>
          <p className="text-brand-200 mt-1">Prueba gratuita de 14 días — sin tarjeta requerida</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Registrar tu club</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del club <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Club de Tenis Providencia"
                value={form.clubName}
                onChange={e => setForm(f => ({ ...f, clubName: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tu nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ana González"
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Providencia"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className="input-field"
                placeholder="admin@miclub.cl"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="tel"
                className="input-field"
                placeholder="+56912345678"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-3 text-base"
              disabled={loading}
            >
              {loading ? 'Registrando...' : 'Crear club y comenzar prueba gratuita'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-brand-600 hover:underline font-medium">
              Inicia sesión
            </Link>
          </p>

          <div className="mt-6 p-4 bg-brand-50 rounded-lg text-sm text-brand-800">
            <p className="font-semibold mb-1">¿Qué incluye la prueba de 14 días?</p>
            <ul className="list-disc list-inside space-y-1 text-brand-700">
              <li>Gestión completa de canchas y reservas</li>
              <li>Inscripción de jugadores y socios</li>
              <li>Torneos y rankings</li>
              <li>Sin límites de uso durante la prueba</li>
            </ul>
            <p className="mt-2 text-xs text-brand-600">
              Tras los 14 días, un administrador de N-Go activará tu cuenta.
              No existe cargo automático — el upgrade es manual.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
