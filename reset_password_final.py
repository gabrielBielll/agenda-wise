
import psycopg2
import getpass
import bcrypt

# Se não tiver bcrypt, tente pip install bcrypt

def reset_password():
    print("=== Reset de Senha DEFINITIVO - Deep Saúde ===")
    
    db_url = input("Cole a CONNECTION STRING do CockroachDB: ").strip()
    if not db_url: return

    email = input("Email do usuário (ex: admin@deepsaude.com): ").strip()
    nova_senha = getpass.getpass("Nova Senha: ").strip()
    
    # Gerar Hash Bcrypt simples (universal)
    # Buddy aceita 'bcrypt' convencional se não tiver prefixo 'bcrypt+sha512'
    salt = bcrypt.gensalt(rounds=12)
    senha_hash = bcrypt.hashpw(nova_senha.encode('utf-8'), salt).decode('utf-8')
    
    # Adicionar prefixo do buddy se for necessário, mas bcrypt puro costuma funcionar
    # O formato do buddy é `bcrypt+sha512` quando ele combina, mas ele suporta `bcrypt` nativo.
    # Vamos tentar o formato bcrypt padrão que é $2b$...
    
    print(f"Hash gerado: {senha_hash}")

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        cur.execute("UPDATE usuarios SET senha_hash = %s WHERE email = %s", (senha_hash, email))
        conn.commit()
        
        if cur.rowcount > 0:
            print(f"✅ SUCESSO! Senha de {email} atualizada.")
        else:
            print(f"❌ Usuário {email} não encontrado.")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Erro: {e}")
        print("Instale depedências: pip install psycopg2-binary bcrypt")

if __name__ == "__main__":
    reset_password()
