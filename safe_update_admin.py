
import psycopg2
import bcrypt
import os

# Hash Bcrypt Padrao para '123456' (Gerado ao executar)
SENHA_PARA_TESTAR = "123456"

def update_admin():
    print("=== Update Seguro de Senha do Admin - Deep Saúde ===")
    
    db_url = input("Cole a CONNECTION STRING do CockroachDB (postgresql://...): ").strip()
    if not db_url: return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # 1. Ler Hash Atual
        cur.execute("SELECT senha_hash FROM usuarios WHERE email = 'admin@deepsaude.com'")
        atual = cur.fetchone()
        
        if not atual:
            print("❌ Admin não encontrado!")
            return
            
        hash_antigo = atual[0]
        print(f"\nHash Atual: {hash_antigo}")
        
        # 2. Salvar Backup
        with open("backup_hash_admin.txt", "w") as f:
            f.write(hash_antigo)
        print("✅ Backup do hash salvo em 'backup_hash_admin.txt'.")
        
        # 3. Gerar Novo Hash (Bcrypt Padrão - $2b$)
        print(f"\nGerando novo hash Bcrypt Padrão para '{SENHA_PARA_TESTAR}'...")
        salt = bcrypt.gensalt(12)
        novo_hash = bcrypt.hashpw(SENHA_PARA_TESTAR.encode('utf-8'), salt).decode('utf-8')
        print(f"Novo Hash: {novo_hash}")
        
        # 4. Atualizar no Banco
        input("\nPressione ENTER para confirmar a atualização no banco remoto...")
        cur.execute("UPDATE usuarios SET senha_hash = %s WHERE email = 'admin@deepsaude.com'", (novo_hash,))
        conn.commit()
        
        if cur.rowcount > 0:
            print("✅ SUCESSO! Senha atualizada no remoto.")
            print(f"Tente logar agora com: admin@deepsaude.com / {SENHA_PARA_TESTAR}")
        else:
            print("⚠️ Nenhuma linha alterada (estranho).")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Erro: {e}")
        print("Dica: pip install psycopg2-binary bcrypt")

if __name__ == "__main__":
    update_admin()
