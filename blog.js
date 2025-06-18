import {
    wcmcommand_path,
    authorpath,
    int_csrftoken,
    int_cookie,
} from "./aem_config.js";
import { promises as fs } from "fs";
import { marked } from "marked";
import xlsx from "xlsx";

const delay = (min, max) => {
    const randomDelay = Math.random() * (max - min) + min;
    return new Promise((resolve) => setTimeout(resolve, randomDelay * 1000));
};

async function readArticleData() {
    try {
        const data = await fs.readFile("blogData.json", "utf8");
        const articles = JSON.parse(data);

        for (const article of articles) {
            if (!article || !article.url || !article.content) {
                console.warn("Skipping invalid article data:", article);
                continue;
            }
            const fullUrl = article.url;
            const urlPath = fullUrl.replace("https://www.glowandlovelycareers.in/en/blog", "");

            console.log("Extracted URL path:", urlPath);
            const metaTitle =
                article.content.match(/\*\*Title Tag:\*\* (.*)/)?.[1] || "";

            const metaDescription =
                article.content.match(/\*\*Meta Description:\*\* (.*)/)?.[1] || "";

            const metaKeywords =
                article.content.match(/\*\*Meta Keywords:\*\* (.*)/)?.[1] || "";
            const titleMatch = article.content.match(/\*\*Page Title:\*\* (.+?)\n\n/);

            const match = article.content.match(/\*\*Article Content:\*\*\n\n([\s\S]*)/);
            let articleText = match ? match[1].trim() : "";
            articleText = articleText.replace(/\*\*Search Tags:\*\*[\s\S]*$/, "").trim();

            const matchDate = article.content.match(/\*\*Date:\*\*\s*(.+)/);
            const dateStr = matchDate ? matchDate[1].trim() : null;
            const convertedDate = convertToMMDDYYYY(dateStr);

            const readTimeMatch = article.content.match(/\*\*Read Time:\*\*\s*(\d+)/);
            const readTime = readTimeMatch ? readTimeMatch[1] : null;

            const searchTagMatch = article.content.match(/\*\*Search Tags:\*\*\s*(.+)/);
            const tagLine = searchTagMatch ? searchTagMatch[1].trim() : "";
            const decoded = tagLine.replace(/&#039;/g, "'");
            const tagsArray = decoded.split(",").map(tag => tag.trim());

            const blocks = splitContentIntoBlocks(articleText);

            const title = titleMatch ? titleMatch[1].trim() : "";

            const slug = title
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-');

            const assetMap = getAssetMapFromExcel("assetAssociation.xlsx");
            const missingAssets = [];

            await createBlogFragment(slug);
            await createBlogSectionFolder(slug);

            const sectionPaths = [];
            let firstParagraph = '';
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                if ((block.title || block.content) && !block.title.startsWith("# ") && !block.title.startsWith("**Head Data")) {
                    try {
                        const headingMatch = block.title.match(/^(#{2,4})/);
                        const sectionHeadingType = headingMatch
                            ? headingMatch[0].length === 2
                                ? "h2"
                                : headingMatch[0].length === 3
                                    ? "h3"
                                    : "h4"
                            : "p";

                        const sectionTitle = headingMatch
                            ? block.title.replace(/^[#]+\s*/, "").trim()
                            : "";

                        const fullSectionSlug = `${slug}-section${i + 1}`;
                        const imageRegex = /!\[[^\]]*\]\([^\)\s]+(?:\s+"[^"]*")?\)[^\n]*\n?/g;
                        const sectionDescription = block.content.replace(imageRegex, "").trim();

                        let imageData = extractImageDataFromContent(block.content);

                        if (imageData?.src) {
                            const mappedSrc = assetMap.get(imageData.src);
                            if (mappedSrc) {
                                imageData.src = mappedSrc;
                            } else {
                                missingAssets.push({
                                    src: imageData.src,
                                    path: `/article-blogs/blog-sections/${slug}/${fullSectionSlug}`,
                                    article: slug
                                });
                            }
                        } else {
                            imageData = {
                                src: "",
                                alt: "",
                                title: "",
                                type: ""
                            };
                        }

                        if (i === 0) {
                            firstParagraph = block.content.trim();
                        }

                        await createBlogSectionFragment(fullSectionSlug, slug);
                        await updateBlogSection(
                            fullSectionSlug,
                            sectionTitle,
                            sectionHeadingType,
                            sectionDescription,
                            slug,
                            imageData.src ? imageData.src : '',
                            imageData.alt ? imageData.alt : '',
                            imageData.title ? imageData.title : '',
                            imageData.type ? imageData.type : ''
                        );

                        if (missingAssets.length > 0) {
                            await fs.writeFile("missingAssets.json", JSON.stringify(missingAssets, null, 2), "utf8");
                            console.log("Missing asset entries written to missingAssets.json");
                        }

                        sectionPaths.push(
                            `/content/dam/headless/glowandlovelycareers/article-blogs/blog-sections/${slug}/${fullSectionSlug}`
                        );

                    } catch (error) {
                        console.error(error)
                    }
                }
            }

            const htmlfirstParagraph = formatContent(firstParagraph);

            await updateBlogContent(slug, title, metaTitle, metaKeywords, metaDescription, htmlfirstParagraph, convertedDate, sectionPaths, readTime, tagsArray);
        }
    } catch (err) {
        console.error(err)
    }
}

async function createBlogSectionFolder(folderName) {
    await delay(3, 5);
    try {
        const formData = new FormData();
        formData.append(":name", folderName);
        formData.append("./jcr:primaryType", "sling:Folder");

        const response = await fetch(`${authorpath}article-blogs/blog-sections/${folderName}`, {
            method: "POST",
            headers: {
                cookie: int_cookie,
                "csrf-token": int_csrftoken,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        // console.log(`Folder created successfully for slug: ${folderName}`);
    } catch (error) {
        logErrorToFile(data, error);
    }
}

async function createBlogFragment(name) {
    await delay(3, 5);
    try {
        const formData = new FormData();
        formData.append("_charset_", "utf-8");
        formData.append("parentPath", "/content/dam/headless/glowandlovelycareers/article-blogs/blogs");
        formData.append("template", "/conf/glowandlovelycareers/settings/dam/cfm/models/blog-content");
        formData.append("./jcr:title", `${name}`);
        formData.append("description", "");
        formData.append("name", `${name}`);

        const response = await fetch(wcmcommand_path, {
            method: "POST",
            headers: {
                cookie: int_cookie,
                "csrf-token": int_csrftoken,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        console.log(`Blog fragment created successfully for: ${name}`);
    } catch (error) {
        console.log(error)
    }
}

async function updateBlogContent(
    slug,
    title,
    metaTitle,
    metaKeywords,
    metaDescription,
    firstParagraph,
    convertedDate,
    sectionPaths,
    readTime,
    tagsArray
) {
    await delay(3, 5);
    try {
        const formData = new FormData();
        formData.append(":type", "multiple");
        formData.append(":newVersion", "false");
        formData.append("_charset_", "utf-8");
        formData.append("slug", slug);
        formData.append("metatitle", metaTitle);
        formData.append("metakeywords", metaKeywords);
        formData.append("metadescription", metaDescription);
        formData.append("title", title);
        formData.append("publishDate", `${convertedDate}`);
        formData.append("readtime", readTime);
        formData.append("carddescription", firstParagraph);
        formData.append("bannerid", '139450823');
        formData.append("banneralt", 'Success Stories');
        formData.append("bannertitle", '');
        formData.append("bannerType", 'jpg');
        formData.append("blogtags", '');

        if (sectionPaths && sectionPaths.length > 0) {
            sectionPaths.forEach((path) => {
                formData.append("blogsection", path);
            });
        }

        if (tagsArray && tagsArray.length > 0) {
            tagsArray.forEach((tag) => {
                formData.append("searchtags", tag);
            })
        }

        const response = await fetch(
            `${authorpath}article-blogs/blogs/${slug}.cfm.content.json`,
            {
                method: "POST",
                headers: {
                    cookie: int_cookie,
                    "csrf-token": int_csrftoken,
                },
                body: formData,
            }
        );

        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        console.log(`Fragment populated successfully for: ${slug}`);
    } catch (error) {
        console.log(`Error in adding data to Fragment: ${slug}`);
    }
}

async function createBlogSectionFragment(name, pageSlug) {
    await delay(3, 5);
    try {
        const formData = new FormData();
        formData.append("_charset_", "utf-8");
        formData.append("parentPath", `/content/dam/headless/glowandlovelycareers/article-blogs/blog-sections/${pageSlug}`);
        formData.append("template", "/conf/glowandlovelycareers/settings/dam/cfm/models/blog-section");
        formData.append("./jcr:title", `${name}`);
        formData.append("description", "");
        formData.append("name", `${name}`);

        const response = await fetch(wcmcommand_path, {
            method: "POST",
            headers: {
                cookie: int_cookie,
                "csrf-token": int_csrftoken,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        console.log(`Blog section fragment created successfully for: ${name}`);
    } catch (error) {
        console.log(error)
    }
}

async function updateBlogSection(
    slug,
    title,
    titleType,
    description,
    pageSlug,
    imageSrc,
    imageAlt,
    imageTitle,
    imageType
) {
    await delay(3, 5);
    try {
        const formData = new FormData();
        formData.append(":type", "multiple");
        formData.append(":newVersion", "false");
        formData.append("slug", slug);
        formData.append("title", title);
        formData.append("titletype", titleType !== 'p' ? titleType : '');
        const htmlContent = formatContent(description);
        formData.append("description", htmlContent);
        formData.append("assetid", imageSrc);
        formData.append("assetalt", imageAlt);
        formData.append("assetType", imageType);
        formData.append("assettitle", imageTitle);

        const response = await fetch(
            `${authorpath}article-blogs/blog-sections/${pageSlug}/${slug}.cfm.content.json`,
            {
                method: "POST",
                headers: {
                    cookie: int_cookie,
                    "csrf-token": int_csrftoken,
                },
                body: formData,
            }
        );

        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        console.log(`Fragment populated successfully for: ${slug}`);
    } catch (error) {
        console.log(`Error in adding data to Fragment: ${slug}`);
    }
}

function convertToMMDDYYYY(dateStr) {
    // Remove ordinal suffixes like 'st', 'nd', 'rd', 'th'
    const cleanedDateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');

    // Parse the cleaned string into a Date object
    const parsedDate = new Date(cleanedDateStr);

    if (isNaN(parsedDate)) {
        throw new Error("Invalid date format");
    }

    // Format as mm/dd/yyyy
    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(parsedDate.getDate()).padStart(2, '0');
    const yyyy = parsedDate.getFullYear();

    return `${yyyy}-${mm}-${dd}`;
}

function splitContentIntoBlocks(content) {
    const lines = content.split("\n");
    const hasHeadings = lines.some((line) => /^#{2,6}\s/.test(line.trim()));

    const blocks = [];
    let currentBlock = { title: "", content: "" };

    const totalNbsp = lines.filter((line) => line.trim() === "&nbsp;").length;
    let currentNbspIndex = 0;

    for (const line of lines) {
        const trimmedLine = line.trim();

        const isHeading = /^#{2,6}\s/.test(trimmedLine);
        const isImageMarkdown = /^!\[.*?\]\(.*?\)/.test(trimmedLine);
        const isImageHTML = /^<img\s+.*?>/.test(trimmedLine);
        const isImage = isImageMarkdown || isImageHTML;

        // Handle &nbsp;
        if (trimmedLine === "&nbsp;") {
            currentNbspIndex++;
            if (currentNbspIndex < totalNbsp) {
                if (currentBlock.title || currentBlock.content) {
                    blocks.push(currentBlock);
                }
                currentBlock = { title: "", content: "" };
            } else {
                currentBlock.content += (currentBlock.content ? "\n" : "") + line;
            }
            continue;
        }

        if (isHeading) {
            if (currentBlock.title || currentBlock.content) {
                blocks.push(currentBlock);
            }
            currentBlock = { title: trimmedLine, content: "" };
        }

        else if (!hasHeadings && isImage) {
            if (currentBlock.title || currentBlock.content) {
                blocks.push(currentBlock);
            }
            currentBlock = { title: "", content: trimmedLine };
        }

        else {
            currentBlock.content += (currentBlock.content ? "\n" : "") + line;
        }
    }

    if (currentBlock.title || currentBlock.content) {
        blocks.push(currentBlock);
    }

    return blocks;
}

function formatContent(content) {
    const sections = [];
    let currentSection = "";

    content.split(/\n\n|\n/).forEach((line) => {
        line = line.trim();
        if (line.startsWith("## ")) {
            if (currentSection.trim()) {
                sections.push({
                    isHeader: false,
                    content: currentSection.trim(),
                });
            }

            sections.push({
                isHeader: true,
                content: line,
            });

            currentSection = "";
        } else if (line) {
            currentSection += line + "\n";
        }
    });

    if (currentSection.trim()) {
        sections.push({
            isHeader: false,
            content: currentSection.trim(),
        });
    }

    let htmlContent = sections
        .map((section) => {
            let html = marked(section.content);

            if (section.isHeader) {
                return html;
            } else {
                html = html.replace(/<h2>(.*?)<\/h2>/g, "$1");
                return html;
            }
        })
        .join("\n");

    htmlContent = htmlContent
        .replace(/<p>\s*<\/p>/g, "")
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br><br>");

    return htmlContent;
}

function extractImageDataFromContent(content) {
    const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/;

    const match = content.match(markdownImageRegex);
    if (!match) return null;

    const src = match[2] || "";
    const typeMatch = src.match(/\.(\w+)(?:\?|$)/);

    return {
        alt: match[1] || "",
        src,
        title: match[3] || "",
        type: typeMatch ? typeMatch[1].toLowerCase() : "",
    };
}

function getAssetMapFromExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const map = new Map();
    for (let row of data) {
        const [original, mapped] = row;
        if (original && mapped) {
            map.set(String(original).trim(), String(mapped).trim());
        }
    }
    return map;
}

readArticleData();