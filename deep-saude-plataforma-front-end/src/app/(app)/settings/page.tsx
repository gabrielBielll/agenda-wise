'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Bell, UserCog, Palette, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import IntegracaoGoogleCard from "./IntegracaoGoogleCard";

export default function SettingsPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const { toast } = useToast();

  const handleSaveChanges = () => {
    // Placeholder for saving settings
    toast({
      title: "Configurações Salvas (Simulado)",
      description: "Suas preferências foram atualizadas com sucesso.",
      className: "bg-primary text-primary-foreground"
    });
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-3xl">Configurações do Aplicativo</CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Personalize sua experiência AgendaWise.
          </CardDescription>
        </CardHeader>
      </Card>

      <IntegracaoGoogleCard />

      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center"><UserCog className="mr-2 h-6 w-6 text-primary" />Preferências da Conta</CardTitle>
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
          <CardTitle className="font-headline text-xl flex items-center"><Palette className="mr-2 h-6 w-6 text-primary" />Aparência</CardTitle>
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
          <CardTitle className="font-headline text-xl flex items-center"><ShieldCheck className="mr-2 h-6 w-6 text-primary" />Segurança e Privacidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <Button variant="outline">Alterar Senha (Espaço reservado)</Button>
            <Button variant="outline">Exportar Meus Dados (Espaço reservado)</Button>
            <p className="text-sm text-muted-foreground">Gerencie a segurança da sua conta e as configurações de privacidade de dados.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button size="lg" onClick={handleSaveChanges}>Salvar Todas as Configurações</Button>
      </div>
    </div>
  );
}
