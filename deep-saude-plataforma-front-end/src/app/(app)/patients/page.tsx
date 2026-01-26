"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, ArrowRight, Leaf, Loader2, AlertTriangle } from "lucide-react";

// Interface do Paciente que esperamos da API
interface Patient {
  id: string;
  nome: string;
  email: string | null;
  lastSession?: string; // Futuramente virá dos agendamentos
  avatar_url?: string | null;
}

export default function PatientsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Só executa a busca quando a sessão estiver carregada e autenticada
    if (sessionStatus === 'authenticated') {
      const backendToken = (session as any)?.backendToken;

      if (backendToken) {
        const fetchPatients = async () => {
          setLoading(true);
          setError(null);
          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${backendToken}`,
              },
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.erro || 'Falha ao buscar os dados dos pacientes.');
            }
            const data = await response.json();
            setPatients(data);
          } catch (err: any) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        };

        fetchPatients();
      } else {
        setError("Token de autenticação do backend não foi encontrado na sessão.");
        setLoading(false);
      }
    } else if (sessionStatus === 'unauthenticated') {
      setError("Usuário não autenticado.");
      setLoading(false);
    }
    // A dependência `sessionStatus` garante que o efeito rode quando o status mudar de 'loading' para 'authenticated'
  }, [session, sessionStatus]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };
  
  const filteredPatients = patients.filter(patient =>
    patient.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Buscando seus pacientes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle/> Erro ao Carregar Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              {/* Mantive o (v2 - Real) para nossa verificação final */}
              <CardTitle className="font-headline text-3xl">Meus Pacientes (v2 - Real)</CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Visualize os perfis de pacientes vinculados a você.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Pesquisar pacientes por nome..."
              className="pl-10 w-full md:w-1/2"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredPatients.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPatients.map((patient) => (
                <Card key={patient.id} className="shadow-md hover:shadow-lg transition-shadow flex flex-col">
                  <CardHeader className="flex flex-row items-center space-x-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={patient.avatar_url || ''} alt={patient.nome} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">{getInitials(patient.nome)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="font-headline text-xl">{patient.nome}</CardTitle>
                      {patient.lastSession && <CardDescription>Última Sessão: {new Date(patient.lastSession).toLocaleDateString('pt-BR')}</CardDescription>}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground">Clique para ver o perfil detalhado e as notas de sessão.</p>
                  </CardContent>
                  <CardFooter className="flex justify-end items-center pt-4 border-t">
                    <Button variant="default" size="sm" asChild>
                      <Link href={`/patients/${patient.id}`}>
                        Ver Perfil <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <Leaf className="mx-auto h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="font-headline text-xl text-muted-foreground">Nenhum paciente encontrado.</p>
              <p className="text-sm text-muted-foreground">
                Ainda não há pacientes vinculados ao seu perfil.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
