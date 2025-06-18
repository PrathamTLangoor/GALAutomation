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
    const data = await fs.readFile("successData.json", "utf8");
    const articles = JSON.parse(data);

    for (const article of articles) {
      if (!article || !article.url || !article.content) {
        console.warn("Skipping invalid article data:", article);
        continue;
      }
      const fullUrl = article.url;
      const urlPath = fullUrl.replace("https://www.glowandlovelycareers.in/en/detail-success-stories", "");

      console.log("Extracted URL path:", urlPath);

      const slug = article.url.replace(/\/$/, "").split("/").pop();
      console.log("slug", slug);
      const metaTitle =
        article.content.match(/\*\*Title Tag:\*\* (.*)/)?.[1] || "";

      const metaDescription =
        article.content.match(/\*\*Meta Description:\*\* (.*)/)?.[1] || "";

      const metaKeywords =
        article.content.match(/\*\*Meta Keywords:\*\* (.*)/)?.[1] || "";
      const titleMatch = article.content.match(/\*\*Page Title:\*\* (.+?)\n\n/);
      const fullTitle = titleMatch ? titleMatch[1].trim() : "";
      const title = fullTitle.split(" ")[0];

      const designationMatch = article.content.match(/\*\*Designation:\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/);

      const designation = designationMatch ? designationMatch[1].trim() : "";

      const [education = "", location = ""] = designation.split(",").map(part => part.trim());

      const articleContentMatch = article.content.match(/\*\*Article Content:\*\*\s*\n\n([\s\S]*)/);
      let sectionDescription = articleContentMatch ? articleContentMatch[1].trim() : "";

      const imageRegex = /!\[[^\]]*]\([^\)\s]+(?:\s+"[^"]*")?\)[^\n]*\n?/g;

      sectionDescription = sectionDescription.replace(imageRegex, "").trim();

      const bannerImageSectionMatch = article.content.match(/\*\*Banner Image:\*\*\s*([\s\S]*)/);
      const bannerImageSection = bannerImageSectionMatch ? bannerImageSectionMatch[1].trim() : "";

      const imageData = extractImageDataFromContent(bannerImageSection);

      const quoteMatch = article.content.match(/\*\*Tagline:\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/);
      const quote = quoteMatch ? quoteMatch[1].trim() : "";

      const assetMap = getAssetMapFromExcel("assetAssociation.xlsx");
      const missingAssets = [];
      if (imageData?.src) {
        const mappedSrc = assetMap.get(imageData.src);
        if (mappedSrc) {
          imageData.src = mappedSrc;
        } else {
          missingAssets.push({
            src: imageData.src,
            path: `/success-stories/${title}`,
            article: title
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

      if (missingAssets.length > 0) {
        await fs.writeFile("missingSuccessAssets.json", JSON.stringify(missingAssets, null, 2), "utf8");
        console.log("Missing asset entries written to missingAssets.json");
      }

      const htmlContent = formatContent(sectionDescription);

      await createSuccessStoriesFragment(title);
      await addSuccessStoriesContent(slug, title, metaTitle, metaKeywords, metaDescription, fullTitle, education, location, htmlContent, imageData.src ? imageData.src : '', imageData.alt ? imageData.alt : '', imageData.title ? imageData.title : '', imageData.type ? imageData.type : '', quote);
    }
  } catch (err) {
    console.error(err)
  }
}

async function createSuccessStoriesFragment(name) {
  await delay(3, 5);
  try {
    const formData = new FormData();
    formData.append("_charset_", "utf-8");
    formData.append("parentPath", "/content/dam/headless/glowandlovelycareers/success-stories");
    formData.append("template", "/conf/glowandlovelycareers/settings/dam/cfm/models/success-stories-content");
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

    console.log(`Success Stories fragment created successfully for: ${name}`);
  } catch (error) {
    console.log(error)
  }
}

async function addSuccessStoriesContent(
  slug,
  title,
  metaTitle,
  metaKeywords,
  metaDescription,
  fullTitle,
  designation,
  location,
  maindescription,
  imageSrc,
  imageAlt,
  imageTitle,
  imageType,
  quote
) {
  await delay(3, 5);
  try {
    const formData = new FormData();
    formData.append(":type", "multiple");
    formData.append(":newVersion", "false");
    formData.append("slug", slug);
    formData.append("metatitle", metaTitle);
    formData.append("metakeywords", metaKeywords);
    formData.append("metadescription", metaDescription);
    formData.append("title", fullTitle);
    formData.append("designation", designation);
    formData.append("location", location);
    formData.append("carddescription", maindescription);
    formData.append("bannerid", imageSrc);
    formData.append("banneralt", imageAlt);
    formData.append("bannertitle", imageTitle);
    formData.append("bannerType", imageType);
    formData.append("youtubeid", '');
    formData.append("quote", quote);
    formData.append("maindescription", maindescription);

    const response = await fetch(
      `${authorpath}success-stories/${title}.cfm.content.json`,
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