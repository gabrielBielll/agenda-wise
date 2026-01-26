'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    dob: '',
    address: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock form submission
    console.log("New patient data:", formData);
    toast({
      title: "Paciente Adicionado (Simulado)",
      description: `${formData.name} foi adicionado(a) com sucesso ao seu diretório.`,
      className: "bg-primary text-primary-foreground",
    });
    // Redirect to patients list or the new patient's detail page
    router.push('/patients'); 
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-start mb-6">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href="/patients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="font-headline text-3xl">Adicionar Novo Paciente</h1>
          <p className="text-muted-foreground">Insira os detalhes para o novo perfil do paciente.</p>
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center">
            <UserPlus className="mr-3 h-7 w-7 text-primary" /> Detalhes do Paciente
          </CardTitle>
          <CardDescription>
            Por favor, preencha todos os campos obrigatórios com precisão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input id="name" value={formData.name} onChange={handleChange} placeholder="Ex: João Ninguém" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Data de Nascimento</Label>
                <Input id="dob" type="date" value={formData.dob} onChange={handleChange} required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="email">Endereço de E-mail</Label>
                <Input id="email" type="email" value={formData.email} onChange={handleChange} placeholder="Ex: joao.ninguem@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Número de Telefone</Label>
                <Input id="phone" type="tel" value={formData.phone} onChange={handleChange} placeholder="Ex: +55 (XX) XXXXX-XXXX" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Textarea id="address" value={formData.address} onChange={handleChange} placeholder="Ex: Rua do Bem-Estar, 123, Cidade da Tranquilidade, UF 12345-678" className="min-h-[100px]" />
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg">
                <Save className="mr-2 h-5 w-5" /> Salvar Paciente
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
