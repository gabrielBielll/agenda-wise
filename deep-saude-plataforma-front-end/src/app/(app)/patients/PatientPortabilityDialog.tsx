'use client';

import React, { useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Database, Download, FileJson, FileSpreadsheet,
  FileText, Loader2, RefreshCw, ShieldCheck, UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  formatFromPatientFile, parsePatientFile, splitPatientImportBatches,
  validatePortablePatients,
  type PatientFileFormat, type PatientFileIssue, type PatientImportStrategy,
  type PortablePatient,
} from '@/lib/patient-portability';
import { downloadPatientBase, importPatientBatch } from './actions';

type ImportPreview = { newRecords: number; updates: number; skipped: number };
type Stage = 'idle' | 'validating' | 'ready' | 'importing' | 'done' | 'error';

const formatOptions: Array<{ format: PatientFileFormat; label: string; detail: string; icon: React.ElementType }> = [
  { format: 'csv', label: 'CSV', detail: 'Planilhas', icon: FileSpreadsheet },
  { format: 'json', label: 'JSON', detail: 'Integrações', icon: FileJson },
  { format: 'sql', label: 'SQL', detail: 'Backup técnico', icon: Database },
];

function addSummary(current: ImportPreview, result: { novos?: number; atualizaveis?: number; ignorados?: number }) {
  return {
    newRecords: current.newRecords + (result.novos || 0),
    updates: current.updates + (result.atualizaveis || 0),
    skipped: current.skipped + (result.ignorados || 0),
  };
}

export function PatientPortabilityDialog({ onImported }: { onImported: () => Promise<void> }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<PatientFileFormat | null>(null);
  const [fileName, setFileName] = useState('');
  const [records, setRecords] = useState<PortablePatient[]>([]);
  const [issues, setIssues] = useState<PatientFileIssue[]>([]);
  const [strategy, setStrategy] = useState<PatientImportStrategy>('ignorar_existentes');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);

  const resetImport = () => {
    setFileName('');
    setRecords([]);
    setIssues([]);
    setPreview(null);
    setStage('idle');
    setProgress(0);
    setMessage('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const download = async (format: PatientFileFormat) => {
    setDownloading(format);
    const result = await downloadPatientBase(format);
    setDownloading(null);
    if (!result.success || result.content === undefined) {
      toast({ title: 'Não foi possível baixar a base', description: result.error, variant: 'destructive' });
      return;
    }
    const blob = new Blob([result.content], { type: result.mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename || `agenda-wise-pacientes.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Base preparada com segurança', description: `${format.toUpperCase()} baixado com os pacientes que você pode acessar.` });
  };

  const validateWithServer = async (parsed: PortablePatient[]) => {
    setStage('validating');
    setProgress(4);
    setMessage('Conferindo vínculos, duplicidades e campos no servidor...');
    try {
      const batches = splitPatientImportBatches(parsed);
      let summary: ImportPreview = { newRecords: 0, updates: 0, skipped: 0 };
      for (let index = 0; index < batches.length; index += 1) {
        const result = await importPatientBatch(batches[index], strategy, true);
        setProgress(Math.round(((index + 1) / batches.length) * 100));
        if (!result.success) {
          setIssues((result.errors || []).map(issue => ({ line: issue.linha, field: issue.campo, message: issue.erro })));
          setMessage(result.message || 'A base precisa de ajustes antes da importação.');
          setStage('error');
          return;
        }
        summary = addSummary(summary, result);
      }
      setPreview(summary);
      setStage('ready');
      setMessage('Pré-validação concluída. Nenhum dado foi alterado ainda.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível validar o arquivo.');
      setStage('error');
    }
  };

  const readFile = async (file: File) => {
    resetImport();
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) {
      setStage('error');
      setMessage('O arquivo pode ter no máximo 5 MB. Divida a base e importe em partes.');
      return;
    }
    try {
      const format = formatFromPatientFile(file);
      const parsed = parsePatientFile(await file.text(), format);
      const localIssues = validatePortablePatients(parsed);
      setRecords(parsed);
      setIssues(localIssues);
      if (localIssues.length) {
        setStage('error');
        setMessage(`${localIssues.length} ${localIssues.length === 1 ? 'campo precisa' : 'campos precisam'} de correção.`);
        return;
      }
      await validateWithServer(parsed);
    } catch (error) {
      setStage('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível ler o arquivo.');
    }
  };

  const revalidate = () => {
    setIssues([]);
    setPreview(null);
    void validateWithServer(records);
  };

  const importRecords = async () => {
    setStage('importing');
    setProgress(0);
    setMessage('Importando em lotes seguros...');
    try {
      const batches = splitPatientImportBatches(records);
      let imported = 0;
      for (let index = 0; index < batches.length; index += 1) {
        const result = await importPatientBatch(batches[index], strategy, false);
        if (!result.success) {
          setStage('error');
          setMessage(`${imported} pacientes foram processados antes da interrupção. ${result.message || 'Você pode revisar e tentar novamente; o processo é idempotente.'}`);
          setIssues((result.errors || []).map(issue => ({ line: issue.linha, field: issue.campo, message: issue.erro })));
          return;
        }
        imported += result.processados || batches[index].length;
        setProgress(Math.round(((index + 1) / batches.length) * 100));
      }
      await onImported();
      setStage('done');
      setMessage(`${records.length} ${records.length === 1 ? 'registro processado' : 'registros processados'} com sucesso.`);
      toast({ title: 'Base importada', description: 'A lista de pacientes já foi atualizada.' });
    } catch (error) {
      setStage('error');
      setMessage(error instanceof Error ? error.message : 'A importação foi interrompida.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shrink-0"><Database />Base de pacientes</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pt-6">
          <p className="page-eyebrow">Portabilidade com cuidado</p>
          <DialogTitle>Leve sua base com você.</DialogTitle>
          <DialogDescription>Baixe uma cópia completa do cadastro acessível ou importe uma base em etapas verificáveis.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 pb-6 sm:px-6">
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-sm font-semibold">Baixar base</h3><p className="mt-1 text-xs text-muted-foreground">Inclui cadastro e dados clínicos do perfil; não inclui prontuários nem sessões.</p></div>
              <Download className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {formatOptions.map(({ format, label, detail, icon: Icon }) => (
                <Button key={format} type="button" variant="outline" className="h-auto justify-start px-3 py-3" onClick={() => download(format)} disabled={downloading !== null}>
                  {downloading === format ? <Loader2 className="animate-spin" /> : <Icon />}
                  <span className="text-left"><strong className="block text-xs">{label}</strong><small className="font-normal text-muted-foreground">{detail}</small></span>
                </Button>
              ))}
            </div>
          </section>

          <div className="h-px bg-border/60" />

          <section className="space-y-3">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div><h3 className="text-sm font-semibold">Importar base</h3><p className="mt-1 text-xs text-muted-foreground">CSV, JSON ou SQL gerado pela AgendaWise · até 5 MB e 5.000 pacientes.</p></div>
              <Select value={strategy} onValueChange={(value: PatientImportStrategy) => { setStrategy(value); if (records.length && !issues.length) setStage('idle'); }}>
                <SelectTrigger className="w-full bg-card/50 sm:w-[230px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignorar_existentes">Manter cadastros existentes</SelectItem>
                  <SelectItem value="atualizar_existentes">Atualizar pelos dados do arquivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <input ref={inputRef} type="file" className="sr-only" accept=".csv,.json,.sql,text/csv,application/json,application/sql" onChange={event => event.target.files?.[0] && void readFile(event.target.files[0])} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={event => { event.preventDefault(); setDragging(true); }}
              onDragOver={event => event.preventDefault()}
              onDragLeave={event => { event.preventDefault(); setDragging(false); }}
              onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void readFile(file); }}
              className={dragging ? 'flex w-full flex-col items-center rounded-[20px] border border-primary bg-primary/10 px-5 py-7 text-center transition-colors' : 'flex w-full flex-col items-center rounded-[20px] border border-dashed border-border bg-muted/20 px-5 py-7 text-center transition-colors hover:border-primary/50 hover:bg-primary/5'}
            >
              <span className="soft-icon mb-3 h-12 w-12 rounded-full"><UploadCloud className="h-5 w-5" /></span>
              <strong className="text-sm">{fileName || 'Escolha ou solte sua base aqui'}</strong>
              <span className="mt-1 text-xs text-muted-foreground">O arquivo é lido localmente antes de qualquer envio.</span>
            </button>

            {stage !== 'idle' && (
              <div className={stage === 'error' ? 'rounded-2xl border border-destructive/25 bg-destructive/5 p-4' : stage === 'done' ? 'rounded-2xl border border-success/25 bg-success/10 p-4' : 'rounded-2xl border border-border/60 bg-card/55 p-4'}>
                <div className="flex items-start gap-3">
                  {stage === 'validating' || stage === 'importing' ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" /> : stage === 'error' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />}
                  <div className="min-w-0 flex-1"><strong className="block text-sm">{stage === 'ready' ? 'Pronta para importar' : stage === 'done' ? 'Importação concluída' : stage === 'error' ? 'Revise este arquivo' : stage === 'importing' ? 'Importando pacientes' : 'Validando a base'}</strong><p className="mt-1 text-xs text-muted-foreground">{message}</p></div>
                </div>
                {(stage === 'validating' || stage === 'importing') && <Progress value={progress} className="mt-4 h-2 bg-muted" />}
                {preview && (stage === 'ready' || stage === 'done') && (
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <span className="rounded-xl bg-primary/[0.08] p-2"><strong className="block font-headline text-2xl font-normal text-primary">{preview.newRecords}</strong><small className="text-[9px] text-muted-foreground">novos</small></span>
                    <span className="rounded-xl bg-agenda-confirmada-suave p-2"><strong className="block font-headline text-2xl font-normal text-agenda-confirmada-foreground">{preview.updates}</strong><small className="text-[9px] text-muted-foreground">atualizações</small></span>
                    <span className="rounded-xl bg-muted/60 p-2"><strong className="block font-headline text-2xl font-normal">{preview.skipped}</strong><small className="text-[9px] text-muted-foreground">mantidos</small></span>
                  </div>
                )}
                {issues.length > 0 && (
                  <div className="mt-4 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-background/65 p-3 text-xs">
                    {issues.slice(0, 30).map((issue, index) => <p key={`${issue.line}-${issue.field}-${index}`}><strong>Linha {issue.line} · {issue.field}:</strong> {issue.message}</p>)}
                    {issues.length > 30 && <p className="font-medium text-muted-foreground">E mais {issues.length - 30} problemas...</p>}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {(fileName || stage === 'done') && <Button type="button" variant="ghost" onClick={resetImport}><RefreshCw />Escolher outro</Button>}
              {records.length > 0 && !issues.length && stage === 'idle' && <Button type="button" variant="outline" onClick={revalidate}><ShieldCheck />Validar novamente</Button>}
              {stage === 'ready' && <Button type="button" onClick={importRecords}><UploadCloud />Importar {records.length} {records.length === 1 ? 'paciente' : 'pacientes'}</Button>}
            </div>
          </section>

          <div className="flex items-start gap-2 rounded-xl bg-grafite-tenue px-3 py-2.5 text-[10px] text-grafite-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Estes arquivos podem conter dados pessoais e clínicos. A AgendaWise não inclui prontuários nesta operação e nunca executa o conteúdo de um arquivo SQL enviado.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
