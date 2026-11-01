const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    const token = params.get('token');
    const form = document.getElementById('reset-form');
    const feedback = document.getElementById('feedback');

    if (!uid || !token) {
      feedback.textContent = 'Link inválido ou incompleto.';
      feedback.className = 'error';
      form.querySelector('button').disabled = true;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      const confirm = document.getElementById('confirm').value;

      if (new TextEncoder().encode(password).length > 72) {
        feedback.textContent = 'A senha deve ter no máximo 72 bytes UTF-8 (acentos podem ocupar mais de um byte).';
        feedback.className = 'error';
        return;
      }

      if (password !== confirm) {
        feedback.textContent = 'As senhas não coincidem.';
        feedback.className = 'error';
        return;
      }

      const button = form.querySelector('button');
      button.disabled = true;
      feedback.textContent = '';
      feedback.className = '';

      try {
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, token, newPassword: password })
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error?.message || 'Não foi possível redefinir a senha.');
        }

        feedback.textContent = 'Senha redefinida com sucesso. Você já pode fazer login novamente na extensão.';
        feedback.className = 'success';
        form.remove();
      } catch (err) {
        feedback.textContent = err.message;
        feedback.className = 'error';
        button.disabled = false;
      }
    });
