import ZAI from 'z-ai-web-dev-sdk';

async function main() {
  try {
    const zai = await ZAI.create();

    // Try page reader
    console.log('Reading article...');
    const pageResult = await zai.functions.invoke('page_reader', {
      url: 'https://habr.com/ru/articles/979274/'
    });

    // Extract text content
    if (pageResult.data?.html) {
      const text = pageResult.data.html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Print from character 5000 to 12000
      console.log('\nContent (continued):\n', text.substring(5000, 12000));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
