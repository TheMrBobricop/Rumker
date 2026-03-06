async function checkChatParticipants() {
  try {
    console.log('🔍 Checking chat participants...\n');
    
    // Логинимся
    const loginResponse = await fetch('http://localhost:8080/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'test123'
      })
    });
    
    const loginData = await loginResponse.json();
    const token = loginData.accessToken;
    const userId = loginData.user.id;
    console.log('✅ Logged in as user:', userId);
    
    // Получаем чаты
    const chatsResponse = await fetch('http://localhost:8080/api/chats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const chats = await chatsResponse.json();
    if (chats.length === 0) {
      console.log('❌ No chats found');
      return;
    }
    
    const chatId = chats[0].id;
    console.log(`✅ Using chat: ${chatId}`);
    
    // Проверяем участников чата
    const participantsResponse = await fetch(`http://localhost:8080/api/chats/${chatId}/participants`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (participantsResponse.ok) {
      const participants = await participantsResponse.json();
      console.log('✅ Chat participants:', participants);
      console.log('Type:', typeof participants);
      if (Array.isArray(participants)) {
        participants.forEach(p => {
          console.log(`  - User ID: ${p.userId}, Username: ${p.user?.username || 'N/A'}`);
        });
      } else if (participants.users) {
        participants.users.forEach(p => {
          console.log(`  - User ID: ${p.userId}, Username: ${p.user?.username || 'N/A'}`);
        });
      } else {
        console.log('  Unexpected format:', participants);
      }
    } else {
      console.log('❌ Failed to get participants:', participantsResponse.status);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkChatParticipants();
