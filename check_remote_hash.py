
import psycopg2

db_url = "postgresql://gabriel:Mi97vMT0LHJ-T9h-0NNgdQ@agenda-wise-db-12369.jxf.gcp-southamerica-east1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"
    
try:
    print("Conectando ao banco...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    print("Conectando ao banco...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # 1. Checar Usuários
    print("\n=== CHECAR ADMIN ===")
    cur.execute("SELECT email, papel_id, id FROM usuarios WHERE email = 'admin@deepsaude.com'")
    admin = cur.fetchone()
    
    if admin:
        print(f"✅ Usuário ENCONTRADO: {admin[0]}")
        print(f"Papel ID: {admin[1]}")
        
        # Verificar se Papel ID bate com admin_clinica
        expected_role_id = '1f512630-1e2f-43b0-97fb-5df3dfffc8fe'
        
        if str(admin[1]) == expected_role_id:
            print("✅ Papel ID CORRETO (admin_clinica).")
        else:
            print(f"❌ Papel ID INCORRETO. Esperado: {expected_role_id}, Encontrado: {admin[1]}")
            
            # Verificar se o papel incorreto existe na tabela papeis
            cur.execute("SELECT nome_papel FROM papeis WHERE id = %s", (admin[1],))
            role_name = cur.fetchone()
            if role_name:
                print(f"   Note: O papel atual é '{role_name[0]}'.")
            else:
                print("   Note: O papel ID atual NÃO EXISTE na tabela papeis (Foreign Key Violation ou Orfão).")
                
    else:
        print("❌ Usuário admin@deepsaude.com NÃO ENCONTRADO.")
        
    # 2. Checar Papéis
    print("\n=== PAPÉIS NO BANCO ===")
    cur.execute("SELECT id, nome_papel FROM papeis")
    roles = cur.fetchall()
    for r in roles:
        print(f"ID: {r[0]} | Nome: {r[1]}")
            
    cur.close()
    conn.close()

except Exception as e:
    print(f"Erro: {e}")
