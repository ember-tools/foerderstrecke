import {createRouter, type RouteRecordRaw, type RouterHistory} from 'vue-router'
import {isHelpTopic} from '../help/topics'

const routes: RouteRecordRaw[] = [
    {path: '/', name: 'Landing', component: () => import('../views/LandingView.vue'), meta: {public: true}},
    {path: '/hilfe', name: 'Help', component: () => import('../views/HelpView.vue'), meta: {public: true}},
    {path: '/hilfe/:slug', name: 'HelpTopic', component: () => import('../views/HelpTopicView.vue'), props: true,
        meta: {public: true}},
    {path: '/planer', name: 'Planner', component: () => import('../views/PlannerView.vue'),
        meta: {titleKey: 'routes.planner'}},
    {path: '/lernen', name: 'Learn', component: () => import('../views/LearnView.vue'),
        meta: {titleKey: 'routes.learn'}},
    {path: '/s/:token', name: 'Shared', component: () => import('../views/ShareView.vue'),
        meta: {titleKey: 'routes.shared'}},
    {path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFoundView.vue'),
        meta: {titleKey: 'routes.notFound'}},
]

/**
 * The tool's router, with web history in the browser and memory history when prerendering. An unknown
 * help topic leads to the overview, and every new page starts at the top.
 */
export function createAppRouter(history: RouterHistory) {
    const router = createRouter({history, routes, scrollBehavior: (_to, _from, saved) => saved ?? {top: 0}})
    router.beforeEach(to => to.name !== 'HelpTopic' || isHelpTopic(to.params.slug) || '/hilfe')
    return router
}
