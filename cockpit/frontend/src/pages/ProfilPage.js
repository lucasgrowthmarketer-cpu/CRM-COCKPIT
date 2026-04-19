import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { formatApiError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { AlertCircle, CheckCircle2, KeyRound, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mustChange = !!user?.must_change_password;

  const validate = () => {
    if (!currentPassword) return 'Le mot de passe actuel est requis.';
    if (newPassword.length < 8) return 'Le nouveau mot de passe doit contenir au moins 8 caracteres.';
    if (newPassword === 'industrialdecision') return 'Le nouveau mot de passe ne peut pas etre le mot de passe par defaut.';
    if (newPassword !== confirmPassword) return 'Les deux mots de passe ne correspondent pas.';
    if (newPassword === currentPassword) return 'Le nouveau mot de passe doit etre different de l\'actuel.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await api.put('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Mot de passe modifie avec succes');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Refresh user state to pick up must_change_password = false
      await refreshUser();
      if (mustChange) {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto" data-testid="profil-page">
      <div className="mb-6">
        <h1 className="font-manrope font-bold text-2xl sm:text-3xl text-brand-text-primary">Profil</h1>
        <p className="text-brand-text-secondary font-inter text-sm mt-1">
          Gerer votre compte et votre mot de passe.
        </p>
      </div>

      {mustChange && (
        <div
          className="mb-6 flex items-start gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50"
          data-testid="must-change-banner"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="font-inter text-sm">
            <div className="font-semibold text-amber-900">Changement de mot de passe requis</div>
            <div className="text-amber-800 mt-1">
              Vous utilisez le mot de passe par defaut. Pour acceder au cockpit,
              vous devez choisir un nouveau mot de passe ci-dessous.
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UserIcon className="w-4 h-4 text-brand-primary" />
          <h2 className="font-manrope font-semibold text-brand-text-primary">Informations</h2>
        </div>
        <dl className="space-y-3 font-inter text-sm">
          <div className="flex justify-between">
            <dt className="text-brand-text-secondary">Nom</dt>
            <dd className="text-brand-text-primary font-medium">{user?.nom}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-text-secondary">Email</dt>
            <dd className="text-brand-text-primary font-medium font-jetbrains">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-text-secondary">Role</dt>
            <dd className="text-brand-text-primary font-medium capitalize">{user?.role}</dd>
          </div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-brand-primary" />
          <h2 className="font-manrope font-semibold text-brand-text-primary">Changer le mot de passe</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="flex items-start gap-2 text-sm text-brand-danger bg-red-50 border border-red-200 rounded-lg p-3"
              data-testid="profil-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="current_password" className="font-inter text-brand-text-primary">
              Mot de passe actuel
            </Label>
            <Input
              id="current_password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="font-inter"
              data-testid="current-password-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password" className="font-inter text-brand-text-primary">
              Nouveau mot de passe
            </Label>
            <Input
              id="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="font-inter"
              data-testid="new-password-input"
            />
            <p className="text-xs text-brand-text-secondary">Minimum 8 caracteres, different du mot de passe par defaut.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password" className="font-inter text-brand-text-primary">
              Confirmer le nouveau mot de passe
            </Label>
            <Input
              id="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="font-inter"
              data-testid="confirm-password-input"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="submit"
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter font-medium"
              disabled={submitting}
              data-testid="change-password-submit"
            >
              {submitting ? 'Modification...' : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Changer le mot de passe
                </>
              )}
            </Button>
            {!mustChange && (
              <Button
                type="button"
                variant="ghost"
                onClick={logout}
                className="font-inter text-brand-text-secondary"
              >
                Se deconnecter
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
