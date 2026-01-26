'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserCog, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';

interface PatientData {
  name: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
}

// Mock data, replace with actual data fetching
const fetchPatientData = async (patientId: string): Promise<PatientData> => {
  console.log("Fetching data for patient:", patientId);
  return new Promise(resolve => setTimeout(() => resolve({
    name: 'Johnathan Doe',
    email: 'john.doe@example.com',
    phone: '+1-555-123-4567',
    dob: '1985-06-15',
    address: '123 Wellness St, Tranquility City, CA 90210',
  }), 500));
};


export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.patientId as string;
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<PatientData>({
    name: '',
    email: '',
    phone: '',
    dob: '',
    address: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (patientId) {
      fetchPatientData(patientId).then(data => {
        setFormData(data);
        setLoading(false);
      });
    }
  }, [patientId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock form submission
    console.log("Updated patient data:", formData);
    toast({
      title: "Paciente Atualizado (Simulado)",
      description: `O perfil de ${formData.name} foi atualizado com sucesso.`,
      className: "bg-primary text-primary-foreground",
    });
    router.push(`/patients/${patientId}`); 
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-theme(spacing.16))]"> 
        <Save className="h-12 w-12 animate-spin text-primary" /> 
        <p className="ml-4 text-lg text-muted-foreground">Carregando dados do paciente...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-start mb-6">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href={`/patients/${patientId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="font-headline text-3xl">Editar Perfil do Paciente</h1>
          <p className="text-muted-foreground">Atualize os detalhes para {formData.name}.</p>
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center">
            <UserCog className="mr-3 h-7 w-7 text-primary" /> Editar Informações do Paciente
          </CardTitle>
          <CardDescription>
            Modifique os campos abaixo e salve suas alterações.
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
                <Save className="mr-2 h-5 w-5" /> Atualizar Paciente
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
