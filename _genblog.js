const fs = require('fs/promises');
const showdown = require('showdown');
const converter = new showdown.Converter({metadata: true});

const insertData = async (templateData) => {
  // Given HTML string, insert into the base.html file and
  // return the resulting string
  const baseHtml = await fs.readFile('./_blog_source/base.html');
  const baseString = baseHtml.toString();
  const outString = baseString.replace('###BLOG#CONTENT###', templateData);
  
  return outString
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
  return title.toLowerCase().split(' ').slice(0, 3).join('_') + '.html';
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
    post.fileName = fileName;
    post.publishDate = date;
    post.indexContent = `
    <li>
      <h4>
        <a href="/blog/${fileName}">
          ${metadata.title}</a>
        <em> &mdash; ${dateString}</em>
      </h4>
    </li>`
    post.html = html;
    postArray.push(post);
  }
  // Sort posts by date
  postArray.sort((a, b) => a.publishDate < b.publishDate ? 1 : -1);
  // Generate each blog page contents, and assemble index
  for (let [idx, post] of postArray.entries()) {
    indexContent += post.indexContent;
    // Get next and previous posts for blog footer
    const nextPost = postArray[idx - 1] ? `<a href="${postArray[idx - 1].fileName}">${postArray[idx - 1].title}</a> &#8640;` : '';
    const prevPost = postArray[idx + 1] ? `&#8637; <a href="${postArray[idx + 1].fileName}">${postArray[idx + 1].title}</a>` : '';
    post.html += `<div id="blog-footer"><div>${prevPost}</div> <div>${nextPost}</div></div>`;
    // Write out blog file
    const blogContent = await insertData(post.html);
    await fs.writeFile(`./blog/${post.fileName}`, blogContent);
  }
  indexContent += '</ul>'
  // Write out index file
  const finalTemplate = await insertData(indexContent);
  await fs.writeFile('./blog/index.html', finalTemplate);
}

generate();