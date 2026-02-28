import ZAI from 'z-ai-web-dev-sdk';

async function main() {
  try {
    const zai = await ZAI.create();

    // Try page reader
    console.log('Reading article...');
    const pageResult = await zai.functions.invoke('page_reader', {
      url: 'https://habr.com/ru/articles/979274/'
    });

    console.log('Title:', pageResult.data?.title);
    console.log('Published:', pageResult.data?.publishedTime);
    console.log('HTML length:', pageResult.data?.html?.length);
    
    // Extract text content
    if (pageResult.data?.html) {
      const text = pageResult.data.html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 8000);
      
      console.log('\nContent:\n', text);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
