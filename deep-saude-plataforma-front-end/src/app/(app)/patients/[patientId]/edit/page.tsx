import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog, ArrowLeft } from "lucide-react";
import Link from 'next/link';
import { updatePaciente } from '../../actions';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { notFound } from 'next/navigation';
import EditForm from './EditForm';
// F3: data pura — fatia "YYYY-MM-DD" sem passar por Date/fuso.
import { dataPuraISO } from '@/lib/datetime';

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
      data.data_nascimento = dataPuraISO(data.data_nascimento);
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
    <div className="quiet-page max-w-3xl">
      <div className="mb-2 flex items-center justify-start">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href="/patients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <p className="page-eyebrow mb-1">Perfil do paciente</p>
          <h1 className="page-title text-4xl md:text-4xl">Editar informações</h1>
          <p className="page-subtitle">Atualize os dados com cuidado. As alterações ficam disponíveis imediatamente.</p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="soft-icon mr-3"><UserCog className="h-5 w-5" /></span> Dados do paciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EditForm patient={patient} updateAction={updateAction} />
        </CardContent>
      </Card>
    </div>
  );
}
