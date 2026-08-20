'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Bell, UserCog, Palette, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import IntegracaoGoogleCard from "./IntegracaoGoogleCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getOwnProfile, updateOwnProfile } from "./actions";

export default function SettingsPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const { data: session, update: updateSession } = useSession();
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileEdited = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!profileEdited.current) setProfileName(current => current || session?.user?.name || '');
    setProfileEmail(current => current || session?.user?.email || '');
  }, [session?.user?.name, session?.user?.email]);

  useEffect(() => {
    let active = true;
    getOwnProfile().then((result) => {
      if (!active || !result.success || !result.profile) return;
      if (!profileEdited.current) setProfileName(result.profile.nome);
      setProfileEmail(result.profile.email);
    }).finally(() => active && setLoadingProfile(false));
    return () => { active = false; };
  }, []);

  const handleSaveChanges = async () => {
    setSavingProfile(true);
    const result = await updateOwnProfile(profileName);
    setSavingProfile(false);

    if (!result.success || !result.profile) {
      toast({ title: "Não foi possível salvar", description: result.message, variant: "destructive" });
      return;
    }

    setProfileName(result.profile.nome);
    setProfileEmail(result.profile.email);
    profileEdited.current = false;
    await updateSession({ name: result.profile.nome, user: { name: result.profile.nome } });
    toast({
      title: "Preferências salvas",
      description: result.message,
      className: "bg-success text-success-foreground"
    });
  };

  return (
    <div className="quiet-page max-w-4xl">
      <section><p className="page-eyebrow mb-2">Seu espaço</p><h2 className="page-title">Preferências com intenção.</h2><p className="page-subtitle">Personalize a AgendaWise para acompanhar o ritmo da sua prática.</p></section>

      <IntegracaoGoogleCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><span className="soft-icon mr-3"><UserCog className="h-5 w-5" /></span>Preferências da conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="profileName">Nome de Exibição</Label>
            <Input id="profileName" value={profileName} onChange={(event) => { profileEdited.current = true; setProfileName(event.target.value); }} placeholder="Seu nome" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profileEmail">Endereço de E-mail</Label>
            <Input id="profileEmail" type="email" value={profileEmail} readOnly aria-readonly="true" className="bg-muted/35 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">O e-mail de acesso não é alterado por esta tela.</p>
          </div>
           <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:items-center">
            <Switch
              id="notifications-enabled"
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
            <div><Label htmlFor="notifications-enabled" className="flex items-center"><Bell className="mr-2 h-4 w-4" /> Ativar notificações por e-mail</Label><p className="mt-1 text-xs text-muted-foreground">Preferência demonstrativa até a API de notificações ser conectada.</p></div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><span className="terra-icon mr-3"><Palette className="h-5 w-5" /></span>Aparência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center">
              <div><p className="text-sm font-semibold">Tema da interface</p><p className="mt-1 text-xs text-muted-foreground">A escolha é aplicada em toda a AgendaWise e lembrada neste dispositivo.</p></div>
              <ThemeToggle showLabel className="w-full sm:w-auto" />
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><span className="soft-icon mr-3"><ShieldCheck className="h-5 w-5" /></span>Segurança e privacidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            {/* TODO(account-security): conectar alteração de senha ao provedor de identidade e
                exportação a um job LGPD autenticado. Não simular ações sensíveis. */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" disabled title="Integração de identidade pendente">Alterar senha · em breve</Button>
              <Button variant="outline" disabled title="Job de exportação LGPD pendente">Exportar meus dados · em breve</Button>
            </div>
            <p className="text-sm text-muted-foreground">Gerencie a segurança da sua conta e as configurações de privacidade de dados.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end border-t border-border/50 pt-5">
        <Button className="w-full sm:w-auto" size="lg" onClick={handleSaveChanges} disabled={loadingProfile || savingProfile || !profileName.trim()}>
          {loadingProfile ? 'Carregando perfil...' : savingProfile ? 'Salvando...' : 'Salvar preferências'}
        </Button>
      </div>
    </div>
  );
}
