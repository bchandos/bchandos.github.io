const fs = require('fs/promises');
const showdown = require('showdown');
const converter = new showdown.Converter({
  metadata: true,
  strikethrough: true,
});

const insertData = async (templateName, templateData, key) => {
  // Given a string (templateData), insert into the template 
  // file (templateName) at key and return the resulting string
  const baseHtml = await fs.readFile(`./_blog_source/${templateName}`);
  const baseString = baseHtml.toString();
  return outString = baseString.replace(key, templateData);
}

const clearBlogDirectory = async () => {
  // Remove all files from public /blog directory
  const allFiles = await fs.readdir('./blog');
  for (let file of allFiles) {
    await fs.unlink(`./blog/${file}`);
  }
}

const markDownFileNames = async () => {
  // Find all Markdown files in _blog_source directory
  const allFiles = await fs.readdir('./_blog_source');
  return allFiles.filter(fileName => fileName.endsWith('.md'));
}

const generateFilenameFromTitle = (title) => {
  // Generate a useful filename by taking as many as three words
  // from the blog article title and concatenating with underscores
  return title.toLowerCase().split(' ').slice(0, 4).join('_') + '.html';
}

const generate = async () => {
  /* Gather all Markdown file in source directory, convert them
      to HTML, sort by the publication date contained in the 
      Markdown's metadata, and then generate and index page as
      well as individual HTML files for each post.
  */
  await clearBlogDirectory();
  const mdFiles = await markDownFileNames();
  let indexContent = '<h3>Posts</h3><ul>';
  let rssContent = '';
  const dateOptions = { month: 'long', year: 'numeric', day: 'numeric'}
  // Create an array of posts to later sort by date
  // (date cannot be determined until markdown metadata is parsed)
  let postArray = [];
  for (let mdFile of mdFiles) {
    const mdContents = await fs.readFile(`./_blog_source/${mdFile}`);
    const html = converter.makeHtml(mdContents.toString());
    const metadata = converter.getMetadata();
    const fileName = generateFilenameFromTitle(metadata.title);
    const date = new Date(metadata['published-on']);
    const dateString = date.toLocaleDateString('us-EN', dateOptions);
    let post = {}
    post.title = metadata.title;
    post.tags = metadata.tags.split(',');
    post.fileName = fileName;
    post.publishDate = date;
    post.indexContent = `
    <li>
      <h4>
        <a href="/blog/${fileName}">
          ${metadata.title}</a>
        <em> &mdash; ${dateString}</em>
      </h4>
    </li>`;

    post.rssContent = `
    <item>
      <title>${metadata.title}</title>
      <link>https://billchandos.dev/blog/${fileName}</link>
      <description>${metadata.description}</description>
      <pubDate>${metadata['published-on']}</pubDate>
      <guid>https://billchandos.dev/blog/${fileName}</guid>
    </item>
    `;

    post.html = html;
    postArray.push(post);
  }
  // Sort posts by date
  postArray.sort((a, b) => a.publishDate < b.publishDate ? 1 : -1);
  // Generate each blog page contents, and assemble index
  for (let [idx, post] of postArray.entries()) {
    indexContent += post.indexContent;
    rssContent += post.rssContent;
    // Get next and previous posts for blog footer
    const nextPost = postArray[idx - 1] ? `<a href="${postArray[idx - 1].fileName}">${postArray[idx - 1].title}</a> &#8640;` : '';
    const prevPost = postArray[idx + 1] ? `&#8637; <a href="${postArray[idx + 1].fileName}">${postArray[idx + 1].title}</a>` : '';
    post.html += `<div id="blog-footer"><div>${prevPost}</div> <div>${nextPost}</div></div>`;
    // Process post tags, and find similar posts
    let recommendationArray = [];
    for (let otherPost of postArray.filter(p => p !== post)) {
      const tagCount = post.tags.filter(t => otherPost.tags.includes(t)).length;
      recommendationArray.push(
        {
          tagCount, 
          fileName: otherPost.fileName, 
          title: otherPost.title
        }
      );
    }
    recommendationArray = recommendationArray.filter(r => r.tagCount !== 0);
    recommendationArray.sort((a, b) => b.tagCount - a.tagCount);
    let topTwo = recommendationArray.slice(0, 2);
    if (topTwo.length > 0) {
      let recString = '';
      for (let { fileName, title } of topTwo) {
        recString += `<li><a href="${fileName}">${title}</a></li>`
      }
      post.html += `
      <div id="blog-recommendations">
        <h4>You may also like ... </h4>
        <ul>${recString}</ul>
      </div>
      `;
    }
    // Write out blog file
    const blogContent = await insertData('base.html', post.html, '###BLOG#CONTENT###');
    await fs.writeFile(`./blog/${post.fileName}`, blogContent);
    console.log(`Writing ${post.fileName}.`)
  }
  indexContent += '</ul>'
  // Write out index file
  const finalTemplate = await insertData('base.html', indexContent, '###BLOG#CONTENT###');
  await fs.writeFile('./blog/index.html', finalTemplate);
  console.log('Writing index.html');
  // Write out RSS feed
  const finalRss = await insertData('base_rss.xml', rssContent, '###ITEMS###');
  await fs.writeFile('./blog/rss.xml', finalRss);
  console.log('Writing rss.xml');
}

generate();