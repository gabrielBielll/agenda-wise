import java.sql.*;
import java.time.*;

/** Reproduz a janela em que a instância ANTIGA da aplicação serve contra o
 *  schema NOVO — o que acontece entre o commit da migration e a troca de
 *  tráfego, em TODO deploy zero-downtime, e não só quando o boot novo falha.
 *
 *  Discutido em mensageria/0019 (duna levanta) e 0022 (orla reproduz).
 *  Registrado na D-001 de mensageria/DECISOES.md.
 *
 *  A JVM roda em UTC de propósito: é o default do container do Render, e é o
 *  que faz `java.sql.Timestamp/valueOf` — o caminho de escrita antigo, em
 *  core.clj linha 404 antes do PR #7 — interpretar horário de parede errado
 *  assim que a coluna vira TIMESTAMPTZ.
 *
 *  Como rodar:
 *    curl -sSO https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.3/postgresql-42.7.3.jar
 *    createdb janela_deploy
 *    java -Duser.timezone=UTC -cp postgresql-42.7.3.jar:. JanelaDeploy.java
 *
 *  Ajuste a linha do DriverManager para o teu banco. Ele é destruído e
 *  recriado a cada execução — não aponte para banco que importa.
 *
 *  Esperado: a sessão marcada para 14:00 aparece como 17:00 para a instância
 *  antiga depois da migration, e a linha escrita na janela fica em 11:00 para
 *  sempre. */
public class JanelaDeploy {

  static final String PAREDE = "2026-08-17 14:00:00"; // o que o usuário digitou
  static final ZoneId SP = ZoneId.of("America/Sao_Paulo");

  // caminho de escrita ANTIGO: core.clj linha 404, java.sql.Timestamp/valueOf
  static void escritaAntiga(Connection c, String etiqueta) throws Exception {
    try (PreparedStatement p = c.prepareStatement(
        "INSERT INTO agendamentos (etiqueta, data_hora_sessao) VALUES (?, ?)")) {
      p.setString(1, etiqueta);
      p.setTimestamp(2, Timestamp.valueOf(PAREDE));
      p.executeUpdate();
    }
  }

  // caminho de escrita NOVO: tempo/parse-sql -> OffsetDateTime
  static void escritaNova(Connection c, String etiqueta) throws Exception {
    OffsetDateTime odt = LocalDateTime.parse(PAREDE.replace(' ', 'T'))
        .atZone(SP).toOffsetDateTime();
    try (PreparedStatement p = c.prepareStatement(
        "INSERT INTO agendamentos (etiqueta, data_hora_sessao) VALUES (?, ?)")) {
      p.setString(1, etiqueta);
      p.setObject(2, odt);
      p.executeUpdate();
    }
  }

  static void lerTudo(Connection c, String momento) throws Exception {
    System.out.println("\n--- " + momento + " ---");
    try (Statement s = c.createStatement();
         ResultSet r = s.executeQuery(
             "SELECT etiqueta, data_hora_sessao FROM agendamentos ORDER BY etiqueta")) {
      while (r.next()) {
        String et = r.getString(1);
        // leitura ANTIGA: getTimestamp, renderizado no fuso default da JVM
        String antiga = r.getTimestamp(2).toString().substring(0, 16);
        // leitura NOVA: tempo/->zdt, instante reapresentado em São Paulo
        String nova = r.getTimestamp(2).toInstant().atZone(SP)
            .toLocalDateTime().toString().replace('T', ' ');
        System.out.printf("  %-28s  código antigo mostra: %s   código novo mostra: %s%n",
            et, antiga, nova);
      }
    }
  }

  public static void main(String[] a) throws Exception {
    System.out.println("TimeZone da JVM: " + java.util.TimeZone.getDefault().getID());
    try (Connection c = DriverManager.getConnection(
        "jdbc:postgresql://localhost:5432/janela_deploy", "postgres", System.getenv("PGPASSWORD"))) {

      c.createStatement().execute(
          "DROP TABLE IF EXISTS agendamentos;"
        + "CREATE TABLE agendamentos (etiqueta TEXT, data_hora_sessao TIMESTAMP)");

      // 1. mundo antigo, schema antigo
      escritaAntiga(c, "1-antes-da-migration");
      lerTudo(c, "schema TIMESTAMP, código antigo (o mundo de antes)");

      // 2. a migration real, copiada de 20260811100100-fuso-horario.up.sql
      c.createStatement().execute(
          "ALTER TABLE agendamentos ALTER COLUMN data_hora_sessao TYPE TIMESTAMPTZ "
        + "USING data_hora_sessao AT TIME ZONE 'America/Sao_Paulo'");
      lerTudo(c, "migration aplicada (boot novo ainda não terminou)");

      // 3. a janela: instância ANTIGA escrevendo contra o schema NOVO
      escritaAntiga(c, "2-durante-a-janela");
      // 4. o deploy novo enfim sobe e escreve
      escritaNova(c, "3-depois-do-deploy-bom");
      lerTudo(c, "deploy bom no ar — as três linhas");
    }
  }
}
