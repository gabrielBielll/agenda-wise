"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FileText, ChevronDown, ChevronUp, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";

import { deleteProntuario } from './actions';
import { useTransition } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import ProntuarioForm, { ProntuarioData } from './ProntuarioForm';

export interface Prontuario {
  id: string;
  data_registro: string;
  conteudo: string;
  tipo: 'sessao' | 'anotacao';
  nome_psicologo?: string;
  queixa_principal?: string;
  resumo_tecnico?: string;
  observacoes_estado_mental?: string;
  encaminhamentos_tarefas?: string;
  data_sessao?: string;
  agendamento_id?: string;
  humor?: number;
}

interface ProntuarioItemProps {
  data: Prontuario;
  patientId: string;
  appointments: any[];
}

export default function ProntuarioItem({ data, patientId, appointments }: ProntuarioItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggleExpand = () => setIsExpanded(!isExpanded);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggling expand
    if (confirm("Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.")) {
      startTransition(async () => {
        const result = await deleteProntuario(patientId, data.id);
        if (!result.success) {
          alert(result.message);
        }
      });
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setIsExpanded(true); // Ensure it's expanded when editing looks better usually, or arguably we replace the whole card content.
    // Actually, replacing the whole card content is better.
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // Use session date if available, otherwise registration date
  const displayDate = data.data_sessao 
    ? new Date(data.data_sessao).toLocaleString('pt-BR') 
    : new Date(data.data_registro).toLocaleString('pt-BR');

  if (isPending) {
    return (
        <Card className="bg-background/50 border-l-4 border-l-gray-300 opacity-50 cursor-not-allowed">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm text-center">Excluindo...</CardTitle>
            </CardHeader>
        </Card>
    );
  }

  if (isEditing) {
    const initialData: ProntuarioData = {
        id: data.id,
        conteudo: data.conteudo,
        tipo: data.tipo,
        queixa_principal: data.queixa_principal,
        resumo_tecnico: data.resumo_tecnico,
        observacoes_estado_mental: data.observacoes_estado_mental,
        encaminhamentos_tarefas: data.encaminhamentos_tarefas,
        agendamento_id: data.agendamento_id,
        humor: data.humor
    };

    return (
        <ProntuarioForm 
            patientId={patientId} 
            appointments={appointments}
            initialData={initialData}
            onCancel={handleCancelEdit}
        />
    );
  }

  return (
    <Card 
      className={`bg-background/70 border-l-4 border-l-primary transition-all duration-200 cursor-pointer hover:bg-secondary/10 ${isExpanded ? 'shadow-md' : ''}`}
      onClick={toggleExpand}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-md font-semibold flex items-center gap-2">
            {data.tipo === 'anotacao' ? <StickyNote className="h-4 w-4 text-yellow-500" /> : <FileText className="h-4 w-4 text-blue-500" />}
            {displayDate}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase bg-secondary px-2 py-1 rounded">{data.tipo}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={handleEditClick} title="Editar Registro">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleDelete} title="Excluir Registro">
              <Trash2 className="h-4 w-4" />
            </Button>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        <CardDescription className="text-xs">Registrado por: {data.nome_psicologo || 'Você'}</CardDescription>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4 pt-0 animate-in slide-in-from-top-2 duration-200">
           {/* Show creation date only when expanded */}
           <div className="text-xs text-muted-foreground italic mb-2">
             Criado em: {new Date(data.data_registro).toLocaleString('pt-BR')}
           </div>

           <div className="border-t pt-4 mt-2">
              {data.queixa_principal && (
                <div className="mb-3">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Queixa Principal / Objetivo</h4>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.queixa_principal}</p>
                </div>
              )}
              
              {data.resumo_tecnico && (
                <div className="mb-3">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Resumo Técnico</h4>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.resumo_tecnico}</p>
                </div>
              )}

              {data.observacoes_estado_mental && (
                <div className="mb-3">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Estado Mental</h4>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.observacoes_estado_mental}</p>
                </div>
              )}

              {data.encaminhamentos_tarefas && (
                <div className="mb-3">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Encaminhamentos / Tarefas</h4>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.encaminhamentos_tarefas}</p>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Conteúdo Geral</h4>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.conteudo}</p>
              </div>
           </div>
        </CardContent>
      )}
    </Card>
  );
}
