import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog, ArrowLeft } from "lucide-react";
import Link from 'next/link';
import { updatePaciente } from '../../actions';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { notFound } from 'next/navigation';
import EditForm from './EditForm';

async function getPatientDetails(patientId: string, token: string) {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes/${patientId}`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.data_nascimento) {
      data.data_nascimento = new Date(data.data_nascimento).toISOString().split('T')[0];
    }
    return data;
  } catch (error) {
    return null;
  }
}

export default async function EditPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  
  if (!token) {
    return <p className="p-4">Sessão inválida.</p>;
  }

  const patient = await getPatientDetails(patientId, token);

  if (!patient) {
    notFound();
  }

  const updateAction = updatePaciente.bind(null, patient.id);

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-start mb-6">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href="/patients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="font-headline text-3xl">Editar Paciente</h1>
          <p className="text-muted-foreground">Atualize as informações do perfil do paciente.</p>
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center">
            <UserCog className="mr-3 h-7 w-7 text-primary" /> Dados do Paciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EditForm patient={patient} updateAction={updateAction} />
        </CardContent>
      </Card>
    </div>
  );
}
