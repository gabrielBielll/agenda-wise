
import os
import psycopg2
from urllib.parse import urlparse

# Hash conhecido para 'admin123' (Buddy hash)
# Nota: Escapamos os cifrões para evitar problemas, mas no python string é literal
NEW_HASH = "bcrypt+sha512$81440725041e19d5ccd0d3aec925283f$12$440d56e9582db82e45f2833db73f2744fc6451ac9e558201"

def fix_password():
    print("=== Reset de Senha do Admin - Deep Saúde ===")
    print("Este script irá resetar a senha do usuário 'admin@deepsaude.com' para 'admin123'.")
    
    db_url = input("Por favor, cole a CONNECTION STRING do CockroachDB (começa com postgresql://...): ").strip()
    
    if not db_url:
        print("URL inválida.")
        return

    try:
        # Conectar ao banco
        # Ajuste para psycopg2 lidar com sslmode se necessário
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Verificar usuário atual
        cur.execute("SELECT id, email, senha_hash FROM usuarios WHERE email = 'admin@deepsaude.com'")
        user = cur.fetchone()
        
        if not user:
            print("❌ ERRO: Usuário admin@deepsaude.com NÃO ENCONTRADO no banco de dados!")
            print("Você precisa rodar a migração completa novamente ou criar o usuário.")
            return

        print(f"✅ Usuário encontrado: {user[1]}")
        print(f"Hash atual: {user[2]}")
        
        # Atualizar senha
        print(f"Atualizando senha para hash de 'admin123'...")
        cur.execute("UPDATE usuarios SET senha_hash = %s WHERE email = 'admin@deepsaude.com'", (NEW_HASH,))
        conn.commit()
        
        if cur.rowcount > 0:
            print("✅ SUCESSO! Senha atualizada.")
            print("Tente logar com: admin@deepsaude.com / admin123")
        else:
            print("⚠️ Aviso: Nenhum registro foi alterado (talvez a senha já fosse essa?).")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Ocorreu um erro: {e}")
        print("Certifique-se de que instalou o driver: pip install psycopg2-binary")

if __name__ == "__main__":
    fix_password()
