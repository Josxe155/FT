// Fotografías externas e ilustraciones locales de respaldo. Ver FUENTES_IMAGENES.md.
export const cantons = [
    { slug: 'arenillas', name: 'Arenillas', subtitle: 'Arenillas', image: 'https://machalaecuador.com/wp-content/uploads/2024/10/jhgfl-1.png', source: 'https://machalaecuador.com/portfolio/arenillas/' },
    { slug: 'atahualpa', name: 'Atahualpa', subtitle: 'Paccha', image: './assets/canton-atahualpa.svg', source: 'https://www.goraymi.com/en-ec/el-oro/atahualpa/tourism-guide-d9d427' },
    { slug: 'balsas', name: 'Balsas', subtitle: 'Balsas', image: 'https://balsas.gob.ec/images/NOTICIAS/Balsas_-_El_Oro.jpg', source: 'https://balsas.gob.ec/' },
    { slug: 'chilla', name: 'Chilla', subtitle: 'Chilla', image: 'https://buentrip.app/panel/files/cities/canton-chilla-goecuador.jpg', source: 'https://www.buentrip.app/atractivos-turisticos-por-ciudad/chilla-ecuador/' },
    { slug: 'el-guabo', name: 'El Guabo', subtitle: 'El Guabo', image: 'https://static.wixstatic.com/media/b790b1_cd18f3b82064404cb2356928f3a5de5b~mv2.jpg/v1/fill/w_960%2Ch_639%2Cal_c%2Cq_85/b790b1_cd18f3b82064404cb2356928f3a5de5b~mv2.jpg', source: 'https://eloroelguabo.wixsite.com/elguabo' },
    { slug: 'huaquillas', name: 'Huaquillas', subtitle: 'Huaquillas', image: 'https://s0.wklcdn.com/image_495/14867778/162521690/101768505Master.jpg', source: 'https://es.wikiloc.com/rutas-motociclismo/ruta-turistica-huaquillas-162521688' },
    { slug: 'las-lajas', name: 'Las Lajas', subtitle: 'La Victoria', image: 'https://machalaecuador.com/wp-content/uploads/2024/10/las-lajas-canton-del-oro.webp', source: 'https://machalaecuador.com/portfolio/las-lajas/' },
    { slug: 'machala', name: 'Machala', subtitle: 'Machala', image: 'https://imagenes.extra.ec/files/og_thumbnail/uploads/2021/04/22/6081d70925dd7.jpeg', source: 'https://www.extra.ec/noticia/buena-vida/oro-tierra-broto-riqueza-51348.html' },
    { slug: 'marcabeli', name: 'Marcabelí', subtitle: 'Marcabelí', image: 'https://i0.wp.com/machalamovil.com/wp-content/uploads/2024/05/marcabeli.jpeg?fit=1920%2C1080&ssl=1', source: 'https://machalamovil.com/marcabeli-eden-de-los-andes-celebra-38-anos-de-vida-politica/' },
    { slug: 'pasaje', name: 'Pasaje', subtitle: 'Pasaje', image: 'https://res.cloudinary.com/nexdu/s--f-7k-H_Y--/f_auto%2Cq_auto%2Ct_photo/v1/city/foto-3-pasaje-el-oro', source: 'https://www.nexdu.com/ec/pasaje-o' },
    { slug: 'pinas', name: 'Piñas', subtitle: 'Piñas', image: 'https://i0.wp.com/ciudadorquidea.com/wp-content/uploads/2015/06/15_pinas-ciudad1.jpg?fit=800%2C457&ssl=1', source: 'https://ciudadorquidea.com/atractivos-turisticos-de-las-parroquias-de-pinas/' },
    { slug: 'portovelo', name: 'Portovelo', subtitle: 'Portovelo', image: './assets/canton-portovelo.svg', source: 'https://www.goraymi.com/es-ec/el-oro/portovelo/ciudades/portovelo-a7c2fe9ec' },
    { slug: 'santa-rosa', name: 'Santa Rosa', subtitle: 'Santa Rosa', image: 'https://www.santarosa.gob.ec/web/wp-content/uploads/2021/11/WhatsApp-Image-2021-10-14-at-1.27.26-PM-1-1170x658.jpeg', source: 'https://www.santarosa.gob.ec/web/2021/11/09/santa-rosa-celebra-sus-162-anos-de-cantonizacion-con-diversas-actividades/' },
    { slug: 'zaruma', name: 'Zaruma', subtitle: 'Zaruma', image: 'https://www.clave.com.ec/wp-content/uploads/2017/08/AR-PN-COSTA05-Parque-Central-de-Zaruma-1.jpg', source: 'https://www.clave.com.ec/zaruma-and-its-many-charms/' }
];
export const cantonMap = Object.fromEntries(cantons.map(c => [c.slug, c]));
