'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Bell, CalendarCog, UserCog, Palette, ShieldCheck, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const [isCalendarSynced, setIsCalendarSynced] = useState(false); // Mock state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const { toast } = useToast();

  const handleGoogleCalendarSync = () => {
    // Placeholder for OAuth flow
    setIsCalendarSynced(!isCalendarSynced);
    toast({
      title: `Sincronização com Google Agenda ${!isCalendarSynced ? 'Ativada' : 'Desativada'} (Simulado)`,
      description: `O status da integração do seu calendário foi atualizado.`,
      className: "bg-primary text-primary-foreground"
    });
  };

  const handleSaveChanges = () => {
    // Placeholder for saving settings
    toast({
      title: "Configurações Salvas (Simulado)",
      description: "Suas preferências foram atualizadas com sucesso.",
      className: "bg-primary text-primary-foreground"
    });
  };

  return (
    <div className="quiet-page max-w-4xl">
      <section><p className="page-eyebrow mb-2">Seu espaço</p><h2 className="page-title">Preferências com intenção.</h2><p className="page-subtitle">Personalize a AgendaWise para acompanhar o ritmo da sua prática.</p></section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><span className="soft-icon mr-3"><CalendarCog className="h-5 w-5" /></span>Integração com calendário</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-white/30 p-5 sm:flex-row sm:items-center">
            <div>
              <Label htmlFor="google-calendar-sync" className="text-base font-medium">Sincronização com Google Agenda</Label>
              <p className="text-sm text-muted-foreground">
                {isCalendarSynced ? "Seu calendário está sincronizado no momento." : "Conecte seu Google Agenda para gerenciar agendamentos."}
              </p>
            </div>
            <Button onClick={handleGoogleCalendarSync} variant={isCalendarSynced ? "outline" : "default"}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {isCalendarSynced ? 'Desconectar Google Agenda' : 'Conectar Google Agenda'}
            </Button>
          </div>
          {isCalendarSynced && (
            <Card className="bg-secondary/30 p-4">
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-md">Opções de Sincronização</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch id="two-way-sync" defaultChecked />
                  <Label htmlFor="two-way-sync">Ativar sincronização bidirecional</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="private-events" />
                  <Label htmlFor="private-events">Sincronizar eventos privados como "Ocupado"</Label>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><span className="soft-icon mr-3"><UserCog className="h-5 w-5" /></span>Preferências da conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="profileName">Nome de Exibição</Label>
            <Input id="profileName" defaultValue="Usuário AgendaWise" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profileEmail">Endereço de E-mail</Label>
            <Input id="profileEmail" type="email" defaultValue="usuario@agendawise.com" />
          </div>
           <div className="flex items-center space-x-2">
            <Switch
              id="notifications-enabled"
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
            <Label htmlFor="notifications-enabled" className="flex items-center">
              <Bell className="mr-2 h-4 w-4" /> Ativar Notificações por E-mail
            </Label>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><span className="terra-icon mr-3"><Palette className="h-5 w-5" /></span>Aparência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
                <Switch id="dark-mode" disabled /> {/* Dark mode toggle could be implemented here */}
                <Label htmlFor="dark-mode">Ativar Modo Escuro (Em Breve)</Label>
            </div>
            <p className="text-sm text-muted-foreground">Personalize a aparência do aplicativo.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><span className="soft-icon mr-3"><ShieldCheck className="h-5 w-5" /></span>Segurança e privacidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <Button variant="outline">Alterar Senha (Espaço reservado)</Button>
            <Button variant="outline">Exportar Meus Dados (Espaço reservado)</Button>
            <p className="text-sm text-muted-foreground">Gerencie a segurança da sua conta e as configurações de privacidade de dados.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end border-t border-border/50 pt-5">
        <Button size="lg" onClick={handleSaveChanges}>Salvar Todas as Configurações</Button>
      </div>
    </div>
  );
}
