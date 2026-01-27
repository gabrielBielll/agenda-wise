import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import CalendarClient from './CalendarClient';

async function getAppointments(token: string) {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/agendamentos`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error("Erro ao buscar agendamentos:", response.status);
      return [];
    }
    return response.json();
  } catch (error) {
    console.error("Erro de conexão ao buscar agendamentos:", error);
    return [];
  }
}

async function getPacientes(token: string) {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacientes`;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar pacientes:", error);
    return [];
  }
}

async function getBloqueios(token: string) {
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/bloqueios`;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Erro ao buscar bloqueios:", error);
    return [];
  }
}

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  const [appointments, pacientes, bloqueios] = token 
    ? await Promise.all([getAppointments(token), getPacientes(token), getBloqueios(token)]) 
    : [[], [], []];

  return <CalendarClient appointments={appointments} pacientes={pacientes} bloqueios={bloqueios} />;
}
