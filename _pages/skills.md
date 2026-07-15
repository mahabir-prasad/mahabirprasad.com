---
layout: page
title: Skills
permalink: /skills/
description: A showcase of skills I've acquired, organized by category.
nav: true
nav_order: 4
---

<!--
  Edit `_data/skills.yml` to add/change subsections and images — you don't
  need to touch this file. Each subsection can hold as many images as you
  like; only the first 5 are shown per row, and any extra items simply wrap
  onto a new row underneath.
-->

<div class="skills">
  {% for subsection in site.data.skills %}
    <h3 class="skills-subsection-title{% unless forloop.first %} mt-5{% endunless %}">{{ subsection.name }}</h3>
    {% if subsection.description %}
      <p class="text-muted">{{ subsection.description }}</p>
    {% endif %}

    <div class="row row-cols-2 row-cols-sm-3 row-cols-md-5 g-4 mb-2">
      {% for item in subsection.items limit: 5 %}
        <div class="col text-center d-flex flex-column">
          {% if item.link %}
            <a href="{{ item.link }}" target="_blank" rel="noopener noreferrer">
              {% include figure.liquid loading="eager" path=item.image class="img-fluid rounded z-depth-1" %}
            </a>
            <a href="{{ item.link }}" target="_blank" rel="noopener noreferrer" class="skill-caption mt-2 mb-0 small">
              {{ item.description }}
            </a>
          {% else %}
            {% include figure.liquid loading="eager" path=item.image class="img-fluid rounded z-depth-1" %}
            <p class="skill-caption mt-2 mb-0 small">{{ item.description }}</p>
          {% endif %}
        </div>
      {% endfor %}
    </div>
  {% endfor %}
</div>

