
import os
import psycopg2

def check_hash():
    print("=== Verificador de Hash de Senha - Deep Saúde ===")
    print("Este script APENAS LÊ o banco de dados. Não altera nada.")
    
    db_url = input("Cole a CONNECTION STRING do CockroachDB (postgresql://...): ").strip()
    
    if not db_url:
        print("URL inválida.")
        return

    try:
        # Tenta conectar (requer psycopg2 ou psycopg2-binary instalado)
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        email_alvo = 'admin@deepsaude.com'
        print(f"Buscando usuário: {email_alvo}...")
        
        cur.execute("SELECT id, email, senha_hash FROM usuarios WHERE email = %s", (email_alvo,))
        user = cur.fetchone()
        
        if not user:
            print(f"❌ Usuário {email_alvo} NÃO encontrado no banco.")
        else:
            original_hash = user[2]
            print("\n✅ Usuário encontrado!")
            print(f"Email: {user[1]}")
            print(f"Hash no Banco Remoto: '{original_hash}'")
            
            # Comparação com o esperado (admin123)
            hash_esperado = "bcrypt+sha512$81440725041e19d5ccd0d3aec925283f$12$440d56e9582db82e45f2833db73f2744fc6451ac9e558201"
            
            if original_hash == hash_esperado:
                print("\n✅ O Hash está IDENTICO ao arquivo de migração.")
                print("Se a senha não funciona, o problema é outro (ex: versão do algoritmo no backend remoto).")
            else:
                print("\n❌ O Hash está CORROMPIDO/DIFERENTE.")
                print(f"Esperado: '{hash_esperado}'")
                print("Diferença detectada! Isso confirma que a migração alterou os caracteres especiais.")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"\n❌ Erro ao conectar/consultar: {e}")
        print("Dica: pip install psycopg2-binary")

if __name__ == "__main__":
    check_hash()
